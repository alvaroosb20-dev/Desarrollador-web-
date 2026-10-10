import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { serviceClient } from '@/lib/supabase/server';
import { notifyAdmin, sendOrderEmail } from '@/lib/email';
import { getSettings } from '@/lib/settings';
import { euros } from '@/lib/format';
import { siteUrl } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook de Stripe. Es la ÚNICA vía por la que un pedido pasa a "pagado":
 * se verifica la firma, se procesa cada evento una sola vez y solo se marca
 * como pagado cuando Stripe confirma payment_status = "paid".
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Falta la firma' }, { status: 400 });

  const raw = await req.text();
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    console.error('Firma de webhook no válida', e);
    return NextResponse.json({ error: 'Firma no válida' }, { status: 400 });
  }

  const db = serviceClient();
  const { error: dupErr } = await db.from('stripe_events').insert({ id: event.id, type: event.type });
  if (dupErr) {
    if (dupErr.code === '23505') return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ error: 'db' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object;
        if (s.payment_status === 'paid') await markPaid(s);
        break;
      }
      case 'checkout.session.async_payment_failed': {
        await markSession(event.data.object.id, 'failed', 'payment_failed');
        break;
      }
      case 'checkout.session.expired': {
        await markSession(event.data.object.id, 'expired', 'cancelled');
        break;
      }
      case 'charge.refunded': {
        const pi = event.data.object.payment_intent;
        if (pi && event.data.object.refunded) {
          await db.from('payments').update({ status: 'refunded' }).eq('stripe_payment_intent', pi);
        }
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('Error procesando webhook', e);
    // borramos el registro para que el reintento de Stripe se procese
    await db.from('stripe_events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'processing' }, { status: 500 });
  }
}

async function markSession(sessionId: string, paymentStatus: 'failed' | 'expired', orderStatus: string) {
  const db = serviceClient();
  const { data: pay } = await db
    .from('payments')
    .update({ status: paymentStatus })
    .eq('stripe_session_id', sessionId)
    .eq('status', 'pending')
    .select('order_id')
    .maybeSingle();
  if (pay) {
    await db.from('orders').update({ status: orderStatus }).eq('id', pay.order_id).eq('status', 'pending_payment');
  }
}

async function markPaid(session: any) {
  const db = serviceClient();
  const { data: pay, error } = await db
    .from('payments')
    .select('id, order_id, amount_cents, kind, status')
    .eq('stripe_session_id', session.id)
    .maybeSingle();
  if (error) throw error;
  if (!pay) {
    console.warn('Pago de Stripe sin registro local', session.id);
    return;
  }
  if (pay.status === 'paid') return;
  if (session.amount_total !== pay.amount_cents || (session.currency ?? 'eur') !== 'eur') {
    throw new Error(`Importe inesperado en la sesión ${session.id}`);
  }

  const { error: e1 } = await db
    .from('payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    })
    .eq('id', pay.id);
  if (e1) throw e1;

  const { data: order, error: e2 } = await db
    .from('orders')
    .select('id, total_cents, package_snapshot, contacts(name, email)')
    .eq('id', pay.order_id)
    .single();
  if (e2) throw e2;

  const { data: paid } = await db.from('payments').select('amount_cents').eq('order_id', order.id).eq('status', 'paid');
  const paidTotal = (paid ?? []).reduce((acc: number, p: any) => acc + p.amount_cents, 0);
  const newStatus = paidTotal >= order.total_cents ? 'paid' : 'deposit_paid';
  const { error: e3 } = await db.from('orders').update({ status: newStatus }).eq('id', order.id);
  if (e3) throw e3;

  const settings = await getSettings();
  const contact: any = Array.isArray(order.contacts) ? order.contacts[0] : order.contacts;
  const pkgName = (order.package_snapshot as any)?.name ?? 'Plan';
  await Promise.allSettled([
    notifyAdmin(
      'Pago confirmado por Stripe',
      [
        ['Plan', pkgName],
        ['Importe cobrado', euros(pay.amount_cents)],
        ['Total del plan', euros(order.total_cents)],
        ['Estado', newStatus === 'paid' ? 'Pagado' : 'Señal pagada'],
        ['Cliente', contact ? `${contact.name} · ${contact.email}` : '—'],
      ],
      `${siteUrl()}/admin/contrataciones`,
    ),
    contact
      ? sendOrderEmail({
          to: contact.email,
          name: contact.name,
          brand: settings.business_name,
          title: 'Pago recibido',
          lines: [
            `Hemos recibido tu pago de ${euros(pay.amount_cents)} para el plan ${pkgName}.`,
            newStatus === 'paid'
              ? 'El plan está pagado por completo.'
              : `Queda pendiente ${euros(order.total_cents - paidTotal)}, que se abonará según lo acordado.`,
            'En breve te contactaremos para empezar. Recibirás el recibo de Stripe en un correo aparte.',
          ],
          replyTo: settings.contact_email,
        })
      : Promise.resolve(),
  ]);
}
