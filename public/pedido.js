// Estado del pedido. Volver de Stripe NO significa que esté pagado: solo se muestra
// «Pagado» cuando el servidor lo confirma tras recibir el aviso firmado de Stripe.
import { $, boot, callFunction, esc, euros, icon } from './assets/js/common.js';

const root = $('[data-order-root]');
await boot();
const params = new URLSearchParams(location.search);
const id = params.get('pedido');
const fromStripe = params.has('session_id');

const TEXT = {
  awaiting_quote: ['wait', 'Pendiente de presupuesto', 'Hemos recibido tu solicitud. Revisaremos tus requisitos y te enviaremos el presupuesto definitivo antes de cobrar nada.'],
  pending_payment: ['wait', 'Pendiente de pago', 'Todavía no hemos recibido la confirmación del pago.'],
  payment_setup_pending: ['wait', 'Registrado, sin cobro', 'Hemos registrado tu contratación. El pago online aún no está activado, así que no se ha cobrado nada: te contactaremos para confirmar los detalles y la forma de pago.'],
  deposit_paid: ['ok', 'Señal pagada', 'Hemos recibido la señal. En breve te contactaremos para empezar.'],
  paid: ['ok', 'Pagado', 'Pago confirmado. En breve te contactaremos para empezar.'],
  payment_failed: ['bad', 'Pago no completado', 'El pago no se ha completado y no se ha cobrado nada. Puedes intentarlo de nuevo o agendar una llamada.'],
  cancelled: ['bad', 'Cancelado', 'Este pedido está cancelado. No se ha cobrado nada.'],
  in_progress: ['ok', 'En desarrollo', 'Estamos trabajando en tu web.'],
  delivered: ['ok', 'Entregado', 'Tu web está entregada.'],
};

let tries = 0;
async function load() {
  let o;
  try {
    ({ order: o } = await callFunction('checkout', null, { method: 'GET', query: `?pedido=${encodeURIComponent(id ?? '')}` }));
  } catch (e) {
    root.innerHTML = `<p class="form-error" role="alert">${esc(e.message)}</p>`;
    return;
  }
  const [tone, label, text] = TEXT[o.status] ?? ['', o.status, ''];
  const waiting = o.status === 'pending_payment' && fromStripe && tries < 20;
  root.innerHTML = `<div class="form-card" style="max-width:680px" aria-live="polite">
      <p><span class="status-pill ${tone}">${esc(label)}</span></p>
      <h2 style="font-size:1.5rem;margin:14px 0 8px">${esc(o.packageName)}</h2>
      <p class="muted">${esc(waiting ? 'Estamos esperando la confirmación de Stripe. Esta página se actualiza sola; puede tardar unos segundos.' : text)}</p>
      <div class="totals">
        <div><span>Precio del plan</span><span>${euros(o.totalCents)}</span></div>
        ${o.maintenanceName ? `<div><span>Mantenimiento elegido</span><span>${esc(o.maintenanceName)}</span></div>` : ''}
        <div class="grand"><span>Cobrado</span><span>${euros(o.paidCents)}</span></div>
      </div>
      <div class="hero-actions">
        <a class="btn btn-call" href="reservas.html">${icon('calendar', 18)}<span>Agendar una llamada</span></a>
        <a class="btn btn-ghost" href="index.html">Volver a la web</a>
      </div>
    </div>`;
  if (waiting) {
    tries++;
    setTimeout(load, 3000);
  }
}

if (!id) root.innerHTML = '<p class="form-error">Falta el número de pedido.</p>';
else await load();
