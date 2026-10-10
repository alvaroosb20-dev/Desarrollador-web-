// Cambiar o cancelar una cita con el enlace seguro del correo.
// El token va en el fragmento (#t=…): no se envía a ningún servidor al cargar la página.
import { $, boot, callFunction, esc, icon, setBusy } from './assets/js/common.js';
import { longDate, mountPicker, visitorTz } from './assets/js/calendar.js';
import { tzLabel } from './assets/js/time.js';

const root = $('[data-manage-root]');
await boot();
const token = new URLSearchParams(location.hash.slice(1)).get('t') ?? '';
const tz = visitorTz();

const fail = (msg) => {
  root.innerHTML = `<div class="form-card" style="max-width:680px"><p class="form-error" role="alert">${esc(msg)}</p>
    <div class="hero-actions"><a class="btn btn-call" href="reservas.html">${icon('calendar', 18)}<span>Agendar una llamada</span></a></div></div>`;
};

if (!/^[0-9a-f]{48}$/.test(token)) {
  fail('El enlace no es válido. Ábrelo directamente desde el correo de confirmación.');
} else {
  await show();
}

async function show(message) {
  let b;
  try {
    ({ booking: b } = await callFunction('booking', { action: 'lookup', token }));
  } catch (e) {
    return fail(e.message);
  }
  const states = { confirmed: 'Confirmada', completed: 'Realizada', cancelled: 'Cancelada' };
  root.innerHTML = `<div class="form-card" style="max-width:680px">
      ${message ? `<div class="success-box" role="status" style="margin-bottom:22px">${esc(message)}</div>` : ''}
      <p><span class="status-pill ${b.status === 'confirmed' ? 'ok' : b.status === 'cancelled' ? 'bad' : ''}">${states[b.status] ?? b.status}</span></p>
      <h2 style="font-size:1.5rem;margin:14px 0 6px">${esc(longDate(b.startsAt, tz))}</h2>
      <p class="muted">Hola ${esc(b.name)}. Hora en tu zona: ${esc(tzLabel(tz))}.</p>
      ${
        b.status === 'confirmed'
          ? `<div class="hero-actions">
              ${b.canReschedule ? '<button class="btn btn-primary" type="button" data-change>Cambiar la hora</button>' : ''}
              <button class="btn btn-ghost" type="button" data-cancel>Cancelar la cita</button>
            </div>
            ${b.canReschedule ? '' : '<p class="muted small" style="margin-top:14px">Esta cita ya no se puede cambiar desde aquí. Si lo necesitas, escríbenos.</p>'}`
          : `<div class="hero-actions"><a class="btn btn-call" href="reservas.html">${icon('calendar', 18)}<span>Agendar otra llamada</span></a></div>`
      }
      <div data-panel style="margin-top:26px"></div>
    </div>`;
  $('[data-change]', root)?.addEventListener('click', changePanel);
  $('[data-cancel]', root)?.addEventListener('click', cancelPanel);
}

async function changePanel() {
  const panel = $('[data-panel]');
  panel.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  let data;
  try {
    data = await callFunction('booking', null, { method: 'GET', query: `?token=${token}` });
  } catch (e) {
    panel.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
    return;
  }
  panel.innerHTML = '<div data-picker></div><p class="form-error" role="alert"></p><button class="btn btn-primary" type="button" data-confirm disabled style="margin-top:16px">Confirmar el cambio</button>';
  let chosen = null;
  mountPicker($('[data-picker]', panel), data, (iso) => {
    chosen = iso;
    $('[data-confirm]', panel).disabled = !iso;
  });
  $('[data-confirm]', panel).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    setBusy(btn, true, 'Cambiando…');
    try {
      const r = await callFunction('booking', { action: 'reschedule', token, start: chosen });
      await show(
        `Cita cambiada al ${longDate(r.startsAt, tz)}.${r.emailStatus === 'sent' ? ' Te hemos enviado un correo con la nueva hora.' : ''}`,
      );
    } catch (err) {
      $('.form-error', panel).textContent = err.message;
      setBusy(btn, false);
    }
  });
}

function cancelPanel() {
  const panel = $('[data-panel]');
  panel.innerHTML = `<form class="form" novalidate>
      <div class="field"><label for="reason">Motivo<span class="opt">(opcional)</span></label>
        <textarea class="input" id="reason" name="reason" maxlength="500" rows="2"></textarea></div>
      <p class="form-error" role="alert"></p>
      <div><button class="btn btn-ghost" type="submit">Sí, cancelar la cita</button></div>
    </form>`;
  const form = $('form', panel);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    setBusy(btn, true, 'Cancelando…');
    try {
      await callFunction('booking', { action: 'cancel', token, reason: form.elements.reason.value.trim() });
      await show('La cita se ha cancelado.');
    } catch (err) {
      form.querySelector('.form-error').textContent = err.message;
      setBusy(btn, false);
    }
  });
  form.elements.reason.focus();
}
