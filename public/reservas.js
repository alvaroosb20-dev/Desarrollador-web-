// Página de reservas: calendario propio (Supabase) o Calendly, según el panel.
import { $, boot, callFunction, clearErrors, configured, esc, icon, leadToken, newKey, setBusy, setFieldError, whatsappLink } from './assets/js/common.js';
import { longDate, mountPicker } from './assets/js/calendar.js';
import { tzLabel } from './assets/js/time.js';

const root = $('[data-booking-root]');
const content = await boot();
const s = content.settings;

function alternatives() {
  const wa = whatsappLink(s.whatsapp, 'Hola, me gustaría hablar sobre una página web.');
  const links = [
    wa ? `<a class="btn btn-ghost" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat', 18)}<span>Escribir por WhatsApp</span></a>` : '',
    s.contact_email ? `<a class="btn btn-ghost" href="mailto:${esc(s.contact_email)}">${icon('mail', 18)}<span>Escribir un correo</span></a>` : '',
    '<a class="btn btn-ghost" href="index.html#contacto">Usar el formulario de contacto</a>',
  ];
  return `<div class="hero-actions" style="margin-top:18px">${links.join('')}</div>`;
}

// ---------------------------------------------------------------------
// Calendly (si el administrador lo ha elegido en el panel)
// ---------------------------------------------------------------------
if (s.booking_provider === 'calendly') {
  const url = /^https:\/\/(www\.)?calendly\.com\/[\w\-/]+$/.test(s.calendly_url ?? '') ? s.calendly_url : null;
  if (!url) {
    root.innerHTML = `<p class="notice"><strong>El calendario de reservas no está disponible ahora mismo.</strong> Puedes contactarnos por estas vías:</p>${alternatives()}`;
  } else {
    // Calendly es un servicio externo: se carga solo cuando la persona lo pide.
    root.innerHTML = `<div class="form-card" data-calendly>
        <p>El calendario lo gestiona <strong>Calendly</strong>, un servicio externo. Al abrirlo, Calendly recibirá los datos que introduzcas y puede usar sus propias cookies.</p>
        <button class="btn btn-primary" type="button">${icon('calendar', 18)}<span>Abrir el calendario</span></button>
      </div>`;
    $('[data-calendly] button').addEventListener('click', () => {
      root.innerHTML = `<iframe class="calendly-frame" title="Calendario de reservas" src="${esc(url)}?hide_gdpr_banner=1&embed_type=Inline" loading="lazy"></iframe>`;
    });
  }
} else {
  await ownBooking();
}

// ---------------------------------------------------------------------
// Sistema de reservas propio
// ---------------------------------------------------------------------
async function ownBooking() {
  if (!configured()) {
    root.innerHTML = `<p class="notice"><strong>Las reservas online todavía no están conectadas.</strong> Falta configurar Supabase en <code>config.js</code>. Mientras tanto, puedes contactarnos por estas vías:</p>${alternatives()}`;
    return;
  }
  let data;
  try {
    data = await callFunction('booking', null, { method: 'GET' });
  } catch (e) {
    root.innerHTML = `<p class="form-error" role="alert">${esc(e.message)}</p>${alternatives()}`;
    return;
  }
  if (!data.enabled) {
    root.innerHTML = `<p class="notice"><strong>Ahora mismo no hay reservas online disponibles.</strong> Escríbenos y buscamos un momento para hablar.</p>${alternatives()}`;
    return;
  }
  $('[data-duration]').textContent = data.durationMin;

  root.innerHTML = `
    <div class="booking">
      <section class="form-card" aria-labelledby="pick-title">
        <h2 class="sr-only" id="pick-title">Elige día y hora</h2>
        <div data-picker></div>
      </section>
      <form class="form form-card" id="booking-form" novalidate>
        <div class="booking-summary" data-chosen>${icon('calendar')}<span class="muted">Elige un día y una hora en el calendario.</span></div>
        <p class="err" id="b-start-err" data-error-for="start" role="alert"></p>
        <div class="field"><label for="b-name">Nombre<span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="b-name" name="name" autocomplete="name" maxlength="80" required>
          <p class="err" id="b-name-err" data-error-for="name"></p></div>
        <div class="field"><label for="b-email">Correo electrónico<span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="b-email" name="email" type="email" autocomplete="email" maxlength="254" required>
          <p class="err" id="b-email-err" data-error-for="email"></p></div>
        <div class="field"><label for="b-phone">Teléfono<span class="opt">(opcional)</span></label>
          <input class="input" id="b-phone" name="phone" type="tel" autocomplete="tel" maxlength="30">
          <p class="err" id="b-phone-err" data-error-for="phone"></p></div>
        <div class="field"><label for="b-summary">¿Qué tipo de web necesitas?<span class="opt">(opcional)</span></label>
          <textarea class="input" id="b-summary" name="summary" maxlength="1000" rows="3" placeholder="Por ejemplo: una web para mi taller con cita previa."></textarea></div>
        <div class="hp" aria-hidden="true"><label>No rellenar <input name="website" tabindex="-1" autocomplete="off"></label></div>
        <label class="check"><input type="checkbox" name="privacy" required><span>He leído y acepto la <a href="politica-privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.<span class="req" aria-hidden="true">*</span></span></label>
        <p class="err" id="b-privacy-err" data-error-for="privacy"></p>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-primary" type="submit" disabled>Confirmar la reserva</button>
        <p class="muted small" style="margin:0">${esc(data.meetingDetails || '')}</p>
      </form>
    </div>`;

  const form = $('#booking-form');
  const submitBtn = form.querySelector('button[type=submit]');
  const started = Date.now();
  let chosen = null;
  let tz = null;
  let key = newKey();
  let sending = false;

  const onSelect = (iso, visitorTz) => {
    chosen = iso;
    tz = visitorTz ?? tz;
    submitBtn.disabled = !iso;
    $('[data-chosen]').innerHTML = iso
      ? `${icon('calendar')}<span><strong>${esc(longDate(iso, tz))}</strong><br><span class="muted small">${data.durationMin} minutos, ${esc(tzLabel(tz))}</span></span>`
      : `${icon('calendar')}<span class="muted">Elige un día y una hora en el calendario.</span>`;
  };
  let picker = mountPicker($('[data-picker]'), data, onSelect);
  tz = picker.tz;

  async function reloadSlots() {
    data = await callFunction('booking', null, { method: 'GET' });
    // Se sustituye el contenedor para no duplicar los manejadores de eventos.
    const fresh = document.createElement('div');
    fresh.dataset.picker = '';
    $('[data-picker]').replaceWith(fresh);
    picker = mountPicker(fresh, data, onSelect);
    onSelect(null);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    clearErrors(form);
    const fd = new FormData(form);
    if (!chosen) return setFieldError(form, 'start', 'Elige un día y una hora.');
    const body = {
      action: 'create',
      start: chosen,
      timezone: tz,
      name: String(fd.get('name') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim(),
      summary: String(fd.get('summary') ?? '').trim(),
      privacy: fd.get('privacy') === 'on',
      website: String(fd.get('website') ?? ''),
      leadToken: leadToken(),
      startedAt: started,
      submissionKey: key,
    };
    if (body.name.length < 2) return setFieldError(form, 'name', 'Escribe tu nombre.');
    if (!/^\S+@\S+\.\S+$/.test(body.email)) return setFieldError(form, 'email', 'Revisa el correo: no parece válido.');
    if (!body.privacy) return setFieldError(form, 'privacy', 'Debes aceptar la política de privacidad.');

    sending = true;
    setBusy(submitBtn, true, 'Reservando…');
    try {
      const res = await callFunction('booking', body);
      showConfirmation(res.booking);
    } catch (err) {
      if (err.status === 409) {
        form.querySelector('.form-error').textContent = err.message;
        await reloadSlots().catch(() => {});
      } else if (err.field) setFieldError(form, err.field, err.message);
      else form.querySelector('.form-error').textContent = err.message;
      key = newKey();
    } finally {
      sending = false;
      if (submitBtn.isConnected) {
        setBusy(submitBtn, false);
        submitBtn.disabled = !chosen;
      }
    }
  });

  function showConfirmation(b) {
    const manage = `cita.html#t=${b.manageToken}`;
    const mail = {
      sent: 'Te hemos enviado un correo con los detalles y un archivo para añadir la cita a tu calendario.',
      not_configured: 'Guarda el enlace de abajo: lo necesitarás si quieres cambiar o cancelar la cita (el envío de correos aún no está activado).',
      failed: 'No hemos podido enviarte el correo de confirmación, pero la reserva está guardada. Guarda el enlace de abajo para gestionarla.',
    }[b.emailStatus] ?? '';
    root.innerHTML = `<div class="form-card" style="max-width:680px" role="status" tabindex="-1">
        <div class="done-mark">${icon('check', 30)}</div>
        <h2>Llamada reservada</h2>
        <p class="lead" style="margin:14px 0 6px"><strong style="color:var(--text)">${esc(longDate(b.startsAt, tz))}</strong></p>
        <p class="muted">Zona horaria: ${esc(tzLabel(tz))}${tz !== b.timezone ? `. En nuestra zona (${esc(tzLabel(b.timezone))}) es ${esc(longDate(b.startsAt, b.timezone))}` : ''}.</p>
        <p>${esc(mail)}</p>
        <div class="hero-actions"><a class="btn btn-ghost" href="${manage}">Cambiar o cancelar la cita</a><a class="btn btn-primary" href="index.html#planes">Ver nuestros planes</a></div>
      </div>`;
    root.querySelector('[role=status]').focus();
  }
}
