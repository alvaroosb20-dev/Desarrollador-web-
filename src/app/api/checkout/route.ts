import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { serviceClient } from '@/lib/supabase/server';
import { upsertContact } from '@/lib/contacts';
import { clientIpHash, rateLimit } from '@/lib/request-meta';
import { LEAD_COOKIE, verifyLead } from '@/lib/lead-cookie';
import { cleanText, looksLikeBot, normalizePhone, validateEmail, validateName, validatePhone } from '@/lib/validation';
import { getSettings } from '@/lib/settings';
import { amountDueNow, getStripe } from '@/lib/stripe';
import { siteUrl } from '@/lib/env';
import { euros } from '@/lib/format';
import { notifyAdmin, sendOrderEmail } from '@/lib/email';

export const runtime = 'nodejs';

const bad = (error: string, field?: string, status = 400) => NextResponse.json({ ok: false, error, field }, { status });

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Solicitud no válida.');
  }
  if (looksLikeBot(body as any, 3000)) return bad('No hemos podido verificar el envío. Inténtalo de nuevo.');

  const slug = cleanText(body.package, 60);
  const maintenanceSlug = cleanText(body.maintenance, 60) || null;
  const requirements = cleanText(body.requirements, 4000);
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = normalizePhone(cleanText(body.phone, 30));
  const mode = body.mode === 'quote' ? 'quote' : 'pay';
  const submissionKey = cleanText(body.submissionKey, 64);

  const e1 = validateName(name);
  if (e1) return bad(e1, 'name');
  const e2 = validateEmail(email);
  if (e2) return bad(e2, 'email');
  const e3 = validatePhone(phone);
  if (e3) return bad(e3, 'phone');
  if (body.acceptTerms !== true) return bad('Debes aceptar las condiciones de contratación.', 'acceptTerms');
  if (body.acceptPrivacy !== true) return bad('Debes aceptar la política de privacidad.', 'acceptPrivacy');
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(submissionKey)) return bad('Solicitud no válida. Recarga la página.');

  const db = serviceClient();

  // Reintento del mismo envío → devolvemos el resultado ya creado
  const { data: dup } = await db
    .from('orders')
    .select('id')
    .eq('submission_key', submissionKey)
    .maybeSingle();
  if (dup) return NextResponse.json({ ok: true, redirect: `/contratar/resultado?pedido=${dup.id}` });

  const ipHash = await clientIpHash();
  if (!(await rateLimit('checkout', ipHash, 8, 3600))) return bad('Demasiados intentos seguidos. Espera un poco.', undefined, 429);

  // Precios SIEMPRE desde la base de datos, nunca desde el navegador
  const { data: pkg } = await db.from('packages').select('*').eq('slug', slug).eq('active', true).maybeSingle();
  if (!pkg) return bad('Este plan ya no está disponible.');
  let plan: any = null;
  if (maintenanceSlug) {
    const { data } = await db.from('maintenance_plans').select('*').eq('slug', maintenanceSlug).eq('active', true).maybeSingle();
    if (!data) return bad('El plan de mantenimiento elegido ya no está disponible.');
    plan = data;
  }

  const settings = await getSettings();
  const total = pkg.price_cents as number;
  const dueNow = amountDueNow(total, settings.payment_mode, settings.deposit_percent);
  const stripe = getStripe();

  let status: string;
  if (mode === 'quote') status = 'awaiting_quote';
  else if (stripe) status = 'pending_payment';
  else status = 'payment_setup_pending';

  let orderId: string | null = null;
  try {
    const store = await cookies();
    let requestId = await verifyLead(store.get(LEAD_COOKIE)?.value);
    if (requestId) {
      const { data: r } = await db.from('requests').select('id').eq('id', requestId).maybeSingle();
      if (!r) requestId = null;
    }

    const contact = await upsertContact(db, { name, email, phone: phone || null });
    const { data: order, error } = await db
      .from('orders')
      .insert({
        contact_id: contact.id,
        request_id: requestId,
        package_id: pkg.id,
        package_snapshot: {
          slug: pkg.slug,
          name: pkg.name,
          price_cents: pkg.price_cents,
          features: pkg.features,
          page_limit: pkg.page_limit,
          revision_rounds: pkg.revision_rounds,
        },
        maintenance_plan_id: plan?.id ?? null,
        maintenance_snapshot: plan
          ? { slug: plan.slug, name: plan.name, price_cents: plan.price_cents, price_from: plan.price_from, limits: plan.limits }
          : null,
        requirements: requirements || null,
        total_cents: total,
        amount_due_now_cents: mode === 'quote' ? 0 : dueNow,
        payment_mode: settings.payment_mode,
        status,
        terms_version: settings.terms_version,
        terms_accepted_at: new Date().toISOString(),
        submission_key: submissionKey,
      })
      .select('id')
      .single();
    if (error) throw error;
    orderId = order.id;

    const summaryLines: [string, string][] = [
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
          `${siteUrl()}/admin/contrataciones`,
        ),
        sendOrderEmail({
          to: email,
          name,
          brand: settings.business_name,
          title: 'Hemos recibido tu solicitud de contratación',
          lines: [
            `Plan: ${pkg.name} (${euros(total)}).`,
            status === 'awaiting_quote'
              ? 'Revisaremos tus requisitos y te enviaremos un presupuesto final antes de cobrar nada.'
              : 'Te contactaremos para confirmar los detalles y la forma de pago. No se ha realizado ningún cobro.',
          ],
          replyTo: settings.contact_email,
        }),
      ]);
      return NextResponse.json({ ok: true, redirect: `/contratar/resultado?pedido=${order.id}` });
    }

    // Stripe Checkout: la sesión se crea en el servidor con el importe de la BD
    const session = await stripe!.checkout.sessions.create({
      mode: 'payment',
      locale: 'es',
      customer_email: email,
      client_reference_id: order.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: dueNow,
            product_data: {
              name:
                settings.payment_mode === 'deposit'
                  ? `${pkg.name} — señal inicial (${settings.deposit_percent}%)`
                  : pkg.name,
              description: `Precio total del plan: ${euros(total)}. Dominio, hosting y servicios externos no incluidos salvo acuerdo.`,
            },
          },
        },
      ],
      metadata: { order_id: order.id, kind: settings.payment_mode === 'deposit' ? 'deposit' : 'full' },
      payment_intent_data: { metadata: { order_id: order.id } },
      success_url: `${siteUrl()}/contratar/resultado?pedido=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/contratar/${pkg.slug}?cancelado=1`,
    });

    const { error: payErr } = await db.from('payments').insert({
      order_id: order.id,
      kind: settings.payment_mode === 'deposit' ? 'deposit' : 'full',
      stripe_session_id: session.id,
      amount_cents: dueNow,
      currency: 'eur',
      status: 'pending',
    });
    if (payErr) throw payErr;

    await notifyAdmin('Contratación iniciada (pendiente de pago)', summaryLines, `${siteUrl()}/admin/contrataciones`);
    return NextResponse.json({ ok: true, redirect: session.url });
  } catch (e) {
    console.error('checkout error', e);
    if (orderId) await db.from('orders').update({ status: 'payment_failed' }).eq('id', orderId).eq('status', 'pending_payment');
    return bad('No hemos podido iniciar la contratación. Inténtalo de nuevo o agenda una llamada.', undefined, 500);
  }
}
