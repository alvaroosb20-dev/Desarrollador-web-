import type { Metadata } from 'next';
import Link from 'next/link';
import { serviceClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/validation';
import { euros } from '@/lib/format';
import BookCallButton from '@/components/BookCallButton';
import RefreshSoon from '@/components/RefreshSoon';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Estado de tu contratación', robots: { index: false, follow: false } };

/**
 * El estado se lee SIEMPRE de la base de datos (actualizada por el webhook de
 * Stripe). Volver de Stripe con una URL no marca nada como pagado.
 */
export default async function ResultadoPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const { pedido } = await searchParams;
  let order: any = null;
  if (isUuid(pedido)) {
    const { data } = await serviceClient()
      .from('orders')
      .select('status, total_cents, amount_due_now_cents, package_snapshot')
      .eq('id', pedido)
      .maybeSingle();
    order = data;
  }

  if (!order) {
    return (
      <div className="container page-pad">
        <div className="card" style={{ maxWidth: 640 }}>
          <h1 style={{ fontSize: 28 }}>No encontramos esta contratación</h1>
          <Link href="/#planes" className="btn btn-primary">Ver planes</Link>
        </div>
      </div>
    );
  }

  const name = order.package_snapshot?.name ?? 'Plan';
  const content: Record<string, { title: string; text: string; tone: string }> = {
    paid: { title: '¡Pago recibido!', text: `Hemos recibido el pago de ${name}. Te contactaremos en breve para empezar.`, tone: 'ok' },
    deposit_paid: { title: '¡Señal recibida!', text: `Hemos recibido la señal de ${euros(order.amount_due_now_cents)} para ${name}. Te contactaremos en breve para empezar.`, tone: 'ok' },
    pending_payment: { title: 'Confirmando tu pago…', text: 'Estamos esperando la confirmación de Stripe. Esta página se actualizará sola en unos segundos. Si cerraste la ventana de pago sin pagar, no se ha cobrado nada.', tone: 'warn' },
    awaiting_quote: { title: 'Solicitud recibida', text: `Revisaremos tus requisitos para ${name} y te enviaremos un presupuesto final antes de cobrar nada.`, tone: 'ok' },
    payment_setup_pending: { title: 'Contratación recibida', text: `Hemos registrado tu contratación de ${name}. El pago online aún no está activo: te contactaremos para formalizarlo. No se ha cobrado nada.`, tone: 'ok' },
    payment_failed: { title: 'El pago no se completó', text: 'No se ha realizado ningún cobro. Puedes intentarlo de nuevo o agendar una llamada.', tone: 'error' },
    cancelled: { title: 'Pago cancelado', text: 'La sesión de pago caducó o se canceló. No se ha cobrado nada.', tone: 'error' },
  };
  const c = content[order.status] ?? { title: 'Contratación registrada', text: 'Te contactaremos en breve.', tone: 'ok' };

  return (
    <div className="container page-pad">
      <div className="card" style={{ maxWidth: 680 }} role="status">
        <span className="eyebrow">{name}</span>
        <h1 style={{ fontSize: 34 }}>{c.title}</h1>
        <div className={`alert alert-${c.tone}`}>{c.text}</div>
        <div className="row">
          <Link href="/" className="btn btn-primary">Volver al inicio</Link>
          <BookCallButton />
        </div>
        {order.status === 'pending_payment' ? <RefreshSoon seconds={4} /> : null}
      </div>
    </div>
  );
}
