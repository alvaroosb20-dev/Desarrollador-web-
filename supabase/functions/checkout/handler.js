// POST /functions/v1/checkout  → crea la contratación y, si Stripe está activo, la sesión de pago.
// GET  /functions/v1/checkout?pedido=<uuid> → estado del pedido (sin datos personales).
import { env, fail, handler, ipHash, json, looksLikeBot, rateLimit, readJson, siteUrl, validKey } from '../_shared/http.js';
import { must, rpc, select, selectOne, update, insert, q } from '../_shared/db.js';
import { verifyLead } from '../_shared/crypto.js';
import { getSettings } from '../_shared/settings.js';
import { amountDueNow, asArray, euros } from '../_shared/format.js';
import { notifyAdmin, sendOrderEmail } from '../_shared/email.js';
import { stripeConfigured, stripeRequest } from '../_shared/stripe.js';
import { cleanText, isUuid, normalizePhone, validateEmail, validateName, validatePhone } from '../_shared/wizard.js';

const orderLink = (id) => `${siteUrl()}/pedido.html?pedido=${id}`;

async function status(req) {
  const id = new URL(req.url).searchParams.get('pedido');
  if (!isUuid(id)) return fail(req, 'Pedido no válido.', 404);
  const { data: order } = await selectOne(
    'orders',
    `select=id,status,total_cents,amount_due_now_cents,payment_mode,package_snapshot,maintenance_snapshot,created_at&id=eq.${id}`,
  );
  if (!order) return fail(req, 'No encontramos ese pedido.', 404);
  const pays = must(await select('payments', `select=amount_cents,status&order_id=eq.${id}`), 'pagos');
  const paid = pays.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount_cents, 0);
  return json(req, {
    ok: true,
    order: {
      status: order.status,
      packageName: order.package_snapshot?.name ?? 'Plan',
      maintenanceName: order.maintenance_snapshot?.name ?? null,
      totalCents: order.total_cents,
      dueNowCents: order.amount_due_now_cents,
      paidCents: paid,
      paymentMode: order.payment_mode,
      createdAt: order.created_at,
    },
  });
}

async function create(req) {
  const body = await readJson(req);
  if (!body) return fail(req, 'Solicitud no válida.');
  if (looksLikeBot(body, 3000)) return fail(req, 'No hemos podido verificar el envío. Inténtalo de nuevo.');

  const slug = cleanText(body.package, 60);
  const maintenanceSlug = cleanText(body.maintenance, 60) || null;
  const requirements = cleanText(body.requirements, 4000);
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = normalizePhone(cleanText(body.phone, 30));
  const mode = body.mode === 'quote' ? 'quote' : 'pay';
  const submissionKey = cleanText(body.submissionKey, 64);

  const e1 = validateName(name);
  if (e1) return fail(req, e1, 400, 'name');
  const e2 = validateEmail(email);
  if (e2) return fail(req, e2, 400, 'email');
  const e3 = validatePhone(phone);
  if (e3) return fail(req, e3, 400, 'phone');
  if (body.acceptTerms !== true) return fail(req, 'Debes aceptar las condiciones de contratación.', 400, 'acceptTerms');
  if (body.acceptPrivacy !== true) return fail(req, 'Debes aceptar la política de privacidad.', 400, 'acceptPrivacy');
  if (!validKey(submissionKey)) return fail(req, 'Solicitud no válida. Recarga la página.');

  const ip = await ipHash(req);
  if (!(await rateLimit('checkout', ip, 8, 3600))) return fail(req, 'Demasiados intentos seguidos. Espera un poco.', 429);

  // Precios SIEMPRE desde la base de datos, nunca desde el navegador.
  const { data: pkg } = await selectOne('packages', `select=*&slug=eq.${q(slug)}&active=is.true`);
  if (!pkg) return fail(req, 'Este plan ya no está disponible.');
  let plan = null;
  if (maintenanceSlug) {
    const { data } = await selectOne('maintenance_plans', `select=*&slug=eq.${q(maintenanceSlug)}&active=is.true`);
    if (!data) return fail(req, 'El plan de mantenimiento elegido ya no está disponible.');
    plan = data;
  }

  const settings = await getSettings();
  const total = pkg.price_cents;
  const dueNow = amountDueNow(total, settings.payment_mode, settings.deposit_percent);
  const stripeOn = stripeConfigured();
  const status = mode === 'quote' ? 'awaiting_quote' : stripeOn ? 'pending_payment' : 'payment_setup_pending';
  const requestId = await verifyLead(env('LEAD_SECRET'), cleanText(body.leadToken, 200));

  const { data: rec, error } = await rpc('create_order_record', {
    p: {
      request_id: requestId ?? '',
      name,
      email,
      phone,
      package_id: pkg.id,
      package_snapshot: {
        slug: pkg.slug,
        name: pkg.name,
        price_cents: pkg.price_cents,
        features: asArray(pkg.features),
        page_limit: pkg.page_limit,
        revision_rounds: pkg.revision_rounds,
      },
      maintenance_plan_id: plan?.id ?? '',
      maintenance_snapshot: plan
        ? { slug: plan.slug, name: plan.name, price_cents: plan.price_cents, price_from: plan.price_from, limits: plan.limits }
        : null,
      requirements,
      total_cents: total,
      amount_due_now_cents: mode === 'quote' ? 0 : dueNow,
      payment_mode: settings.payment_mode,
      status,
      terms_version: settings.terms_version,
      submission_key: submissionKey,
    },
  });
  if (error || !rec?.order_id) {
    console.error('checkout error', error);
    return fail(req, 'No hemos podido registrar la contratación. Inténtalo de nuevo o agenda una llamada.', 500);
  }
  const orderId = rec.order_id;

  if (rec.duplicate) {
    // Reintento del mismo envío: si había un pago pendiente, reutilizamos su sesión de Stripe.
    const { data: pending } = await selectOne('payments', `select=stripe_session_id&order_id=eq.${orderId}&status=eq.pending&limit=1`);
    if (pending?.stripe_session_id && stripeOn) {
      try {
        const s = await stripeRequest('GET', `checkout/sessions/${pending.stripe_session_id}`);
        if (s.url && s.status === 'open') return json(req, { ok: true, redirect: s.url });
      } catch (e) {
        console.error('stripe retrieve', e);
      }
    }
    return json(req, { ok: true, redirect: orderLink(orderId) });
  }

  const summaryLines = [
    ['Plan', `${pkg.name} (${euros(total)})`],
    ['Mantenimiento', plan ? `${plan.name} (${euros(plan.price_cents, { from: plan.price_from, monthly: true })})` : 'No'],
    ['Modalidad', mode === 'quote' ? 'Pide presupuesto revisado' : settings.payment_mode === 'deposit' ? `Señal ${settings.deposit_percent}%` : 'Pago completo'],
    ['Requisitos', requirements || '—'],
    ['Cliente', `${name} · ${email}${phone ? ` · ${phone}` : ''}`],
  ];

  if (status !== 'pending_payment') {
    await Promise.allSettled([
      notifyAdmin(
        status === 'awaiting_quote' ? 'Nueva solicitud de presupuesto' : 'Nueva contratación (pago online no activado)',
        summaryLines,
        `${siteUrl()}/admin.html#/contrataciones`,
      ),
      sendOrderEmail({
        to: email,
        name,
        brand: settings.business_name,
        title: 'Hemos recibido tu solicitud de contratación',
        lines: [
          `Plan: ${pkg.name} (${euros(total)}).`,
          status === 'awaiting_quote'
            ? 'Revisaremos tus requisitos y te enviaremos un presupuesto definitivo antes de cobrar nada.'
            : 'Te contactaremos para confirmar los detalles y la forma de pago. No se ha realizado ningún cobro.',
        ],
        replyTo: settings.contact_email,
        link: orderLink(orderId),
      }),
    ]);
    return json(req, { ok: true, redirect: orderLink(orderId) });
  }

  // Stripe Checkout: la sesión se crea en el servidor con el importe de la base de datos.
  try {
    const kind = settings.payment_mode === 'deposit' ? 'deposit' : 'full';
    const session = await stripeRequest(
      'POST',
      'checkout/sessions',
      {
        mode: 'payment',
        locale: 'es',
        customer_email: email,
        client_reference_id: orderId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: dueNow,
              product_data: {
                name: kind === 'deposit' ? `${pkg.name} — señal inicial (${settings.deposit_percent}%)` : pkg.name,
                description: `Precio total del plan: ${euros(total)}. Dominio, hosting y servicios externos no incluidos salvo acuerdo.`,
              },
            },
          },
        ],
        metadata: { order_id: orderId, kind },
        payment_intent_data: { metadata: { order_id: orderId } },
        success_url: `${orderLink(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl()}/contratar.html?plan=${encodeURIComponent(pkg.slug)}&cancelado=1`,
      },
      `checkout-${orderId}`,
    );
    must(
      await insert(
        'payments',
        { order_id: orderId, kind, stripe_session_id: session.id, amount_cents: dueNow, currency: 'eur', status: 'pending' },
        false,
      ),
      'registro del pago',
    );
    await notifyAdmin('Contratación iniciada (pendiente de pago)', summaryLines, `${siteUrl()}/admin.html#/contrataciones`);
    return json(req, { ok: true, redirect: session.url });
  } catch (e) {
    console.error('stripe checkout error', e);
    await update('orders', `id=eq.${orderId}&status=eq.pending_payment`, { status: 'payment_failed' });
    return fail(req, 'No hemos podido iniciar el pago. No se ha cobrado nada. Inténtalo de nuevo o agenda una llamada.', 502);
  }
}

export default handler((req) => (req.method === 'GET' ? status(req) : create(req)), { methods: ['GET', 'POST'] });
