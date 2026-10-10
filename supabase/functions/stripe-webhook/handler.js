// POST /functions/v1/stripe-webhook
// Es la ÚNICA vía por la que un pago con tarjeta pasa a "pagado": se verifica la
// firma de Stripe, cada evento se procesa una sola vez y solo se marca como pagado
// cuando Stripe confirma payment_status = "paid" con el importe esperado.
import { env } from '../_shared/http.js';
import { insert, remove, rpc, selectOne, update, must } from '../_shared/db.js';
import { verifyWebhook } from '../_shared/stripe.js';
import { notifyAdmin, sendOrderEmail } from '../_shared/email.js';
import { getSettings } from '../_shared/settings.js';
import { euros } from '../_shared/format.js';
import { siteUrl } from '../_shared/http.js';

const reply = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

async function markPaid(session) {
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  const r = must(
    await rpc('mark_stripe_session_paid', {
      p_session: session.id,
      p_amount: session.amount_total,
      p_currency: session.currency ?? 'eur',
      p_intent: intent,
    }),
    'confirmación del pago',
  );
  if (!r.found) {
    console.warn('Pago de Stripe sin registro local', session.id);
    return;
  }
  if (r.already) return;

  const { data: order } = await selectOne('orders', `select=id,total_cents,package_snapshot,contacts(name,email)&id=eq.${r.order_id}`);
  if (!order) return;
  const settings = await getSettings();
  const contact = Array.isArray(order.contacts) ? order.contacts[0] : order.contacts;
  const pkgName = order.package_snapshot?.name ?? 'Plan';
  const paidAll = r.order_status === 'paid';
  await Promise.allSettled([
    notifyAdmin(
      'Pago confirmado por Stripe',
      [
        ['Plan', pkgName],
        ['Importe cobrado', euros(r.amount_cents)],
        ['Total del plan', euros(order.total_cents)],
        ['Estado', paidAll ? 'Pagado' : 'Señal pagada'],
        ['Cliente', contact ? `${contact.name} · ${contact.email}` : '—'],
      ],
      `${siteUrl()}/admin.html#/contrataciones`,
    ),
    contact
      ? sendOrderEmail({
          to: contact.email,
          name: contact.name,
          brand: settings.business_name,
          title: 'Pago recibido',
          lines: [
            `Hemos recibido tu pago de ${euros(r.amount_cents)} para el plan ${pkgName}.`,
            paidAll ? 'El plan está pagado por completo.' : 'El resto se abonará según lo acordado en las condiciones.',
            'En breve te contactaremos para empezar. Stripe te enviará el recibo en un correo aparte.',
          ],
          replyTo: settings.contact_email,
          link: `${siteUrl()}/pedido.html?pedido=${order.id}`,
        })
      : Promise.resolve(),
  ]);
}

async function markSession(sessionId, paymentStatus, orderStatus) {
  const { data } = await update('payments', `stripe_session_id=eq.${sessionId}&status=eq.pending`, { status: paymentStatus }, true);
  const pay = Array.isArray(data) ? data[0] : null;
  if (pay) await update('orders', `id=eq.${pay.order_id}&status=eq.pending_payment`, { status: orderStatus });
}

export default async function webhook(req) {
  if (req.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
  const secret = env('STRIPE_WEBHOOK_SECRET');
  if (!secret || !env('STRIPE_SECRET_KEY')) return reply({ error: 'Stripe no configurado' }, 503);

  const raw = await req.text();
  const event = await verifyWebhook(raw, req.headers.get('stripe-signature'), secret);
  if (!event?.id || !event?.type) return reply({ error: 'Firma no válida' }, 400);

  // Idempotencia: cada evento una sola vez.
  const dup = await insert('stripe_events', { id: event.id, type: event.type }, false);
  if (dup.error) {
    if (dup.error.code === '23505') return reply({ received: true, duplicate: true });
    return reply({ error: 'db' }, 500);
  }

  try {
    const obj = event.data?.object ?? {};
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (obj.payment_status === 'paid') await markPaid(obj);
        break;
      case 'checkout.session.async_payment_failed':
        await markSession(obj.id, 'failed', 'payment_failed');
        break;
      case 'checkout.session.expired':
        await markSession(obj.id, 'expired', 'cancelled');
        break;
      case 'charge.refunded':
        if (obj.payment_intent && obj.refunded) {
          await update('payments', `stripe_payment_intent=eq.${obj.payment_intent}`, { status: 'refunded' });
        }
        break;
      default:
        break;
    }
    return reply({ received: true });
  } catch (e) {
    console.error('Error procesando webhook', e);
    // Se borra el registro para que el reintento de Stripe se procese.
    await remove('stripe_events', `id=eq.${encodeURIComponent(event.id)}`);
    return reply({ error: 'processing' }, 500);
  }
}
