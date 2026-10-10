// Contratación: resumen del plan, necesidades adicionales, precio final y condiciones.
// El precio que se cobra lo calcula SIEMPRE el servidor a partir de la base de datos.
import { $, boot, callFunction, clearErrors, esc, euros, icon, leadToken, newKey, setBusy, setFieldError } from './assets/js/common.js';

const root = $('[data-checkout-root]');
const content = await boot();
const s = content.settings;
const params = new URLSearchParams(location.search);
const slug = params.get('plan');
const pkg = content.packages.find((p) => p.slug === slug);

if (!pkg) {
  $('[data-plan-title]').textContent = 'Elige un plan';
  root.innerHTML = `<p class="notice">Ese plan no existe o ya no está disponible.</p>
    <div class="hero-actions" style="margin-top:18px"><a class="btn btn-primary" href="index.html#planes">Ver los planes</a>
    <a class="btn btn-call" href="reservas.html">${icon('calendar', 18)}<span>Agendar una llamada</span></a></div>`;
} else {
  render();
}

function render() {
  document.title = `Contratar ${pkg.name} | ${s.business_name}`;
  $('[data-plan-title]').textContent = `Contratar ${pkg.name}`;
  const deposit = s.payment_mode === 'deposit';
  const pct = Number(s.deposit_percent) || 50;
  const dueNow = deposit ? Math.round((pkg.price_cents * pct) / 100) : pkg.price_cents;
  const features = Array.isArray(pkg.features) ? pkg.features : [];
  const extras = [
    pkg.page_limit ? `Hasta ${pkg.page_limit} páginas o secciones` : null,
    `${pkg.revision_rounds === 1 ? 'Una ronda' : `${pkg.revision_rounds} rondas`} de modificaciones acordadas`,
  ].filter(Boolean);

  root.innerHTML = `
  ${params.get('cancelado') ? '<p class="notice" role="status" style="margin-bottom:22px"><strong>Has cancelado el pago.</strong> No se ha cobrado nada. Puedes revisarlo e intentarlo de nuevo cuando quieras.</p>' : ''}
  <div class="checkout">
    <form class="form" id="checkout-form" novalidate>
      <section class="form-card">
        <h2 style="font-size:1.3rem;margin-bottom:6px">1. Qué incluye</h2>
        <p class="muted" style="margin:0">${esc(pkg.description ?? pkg.audience ?? '')}</p>
        <ul class="feature-list">${features.map((f) => `<li>${icon('check', 16)}<span>${esc(f)}</span></li>`).join('')}</ul>
        <p class="muted small" style="margin:16px 0 0">Alcance: ${esc(extras.join('. '))}.</p>
      </section>

      <section class="form-card">
        <h2 style="font-size:1.3rem;margin-bottom:14px">2. ¿Necesitas algo más?</h2>
        <div class="field"><label for="k-req">Describe necesidades adicionales<span class="opt">(opcional)</span></label>
          <textarea class="input" id="k-req" name="requirements" maxlength="4000" rows="4" placeholder="Por ejemplo: un blog, varios idiomas, conexión con tu programa de facturación…"></textarea></div>
        ${
          content.maintenance.length
            ? `<div class="field" style="margin-top:8px"><span class="label">Mantenimiento mensual<span class="opt">(opcional, se cobra aparte)</span></span>
                <div class="radio-cards">
                  <label class="radio-card"><input type="radio" name="maintenance" value="" checked><span>Sin mantenimiento<small>Puedes contratarlo más adelante.</small></span><span class="p"></span></label>
                  ${content.maintenance
                    .map(
                      (m) => `<label class="radio-card"><input type="radio" name="maintenance" value="${esc(m.slug)}"><span>${esc(m.name)}<small>${esc(m.limits ?? '')}</small></span><span class="p">${euros(m.price_cents, { from: m.price_from, monthly: true })}</span></label>`,
                    )
                    .join('')}
                </div></div>`
            : ''
        }
        <div class="field" style="margin-top:8px"><span class="label">Cómo quieres continuar</span>
          <div class="radio-cards">
            <label class="radio-card"><input type="radio" name="mode" value="pay" checked><span>Contratar y pagar ${deposit ? 'la señal' : 'ahora'}<small>${deposit ? `Pagas el ${pct}% para reservar el proyecto; el resto, según las condiciones.` : 'Pago seguro con tarjeta mediante Stripe.'}</small></span><span class="p">${euros(dueNow)}</span></label>
            <label class="radio-card"><input type="radio" name="mode" value="quote"><span>Quiero un presupuesto definitivo antes de pagar<small>Recomendado si has descrito necesidades adicionales. No se cobra nada ahora.</small></span><span class="p">0 €</span></label>
          </div></div>
      </section>

      <section class="form-card">
        <h2 style="font-size:1.3rem;margin-bottom:14px">3. Tus datos</h2>
        <div class="form">
          <div class="field"><label for="k-name">Nombre o razón social<span class="req" aria-hidden="true">*</span></label>
            <input class="input" id="k-name" name="name" autocomplete="name" maxlength="80" required><p class="err" id="k-name-err" data-error-for="name"></p></div>
          <div class="row-2">
            <div class="field"><label for="k-email">Correo electrónico<span class="req" aria-hidden="true">*</span></label>
              <input class="input" id="k-email" name="email" type="email" autocomplete="email" maxlength="254" required><p class="err" id="k-email-err" data-error-for="email"></p></div>
            <div class="field"><label for="k-phone">Teléfono<span class="opt">(opcional)</span></label>
              <input class="input" id="k-phone" name="phone" type="tel" autocomplete="tel" maxlength="30"><p class="err" id="k-phone-err" data-error-for="phone"></p></div>
          </div>
          <div class="hp" aria-hidden="true"><label>No rellenar <input name="website" tabindex="-1" autocomplete="off"></label></div>
          <label class="check"><input type="checkbox" name="acceptTerms" required><span>He leído y acepto las <a href="condiciones.html" target="_blank" rel="noopener">condiciones de contratación</a> (versión ${esc(s.terms_version)}).<span class="req" aria-hidden="true">*</span></span></label>
          <p class="err" id="k-terms-err" data-error-for="acceptTerms"></p>
          <label class="check"><input type="checkbox" name="acceptPrivacy" required><span>He leído y acepto la <a href="politica-privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.<span class="req" aria-hidden="true">*</span></span></label>
          <p class="err" id="k-privacy-err" data-error-for="acceptPrivacy"></p>
          <p class="form-error" role="alert"></p>
        </div>
      </section>
    </form>

    <aside class="form-card" aria-labelledby="sum-title">
      <h2 id="sum-title" style="font-size:1.2rem">Resumen</h2>
      <div class="totals" data-totals></div>
      <p class="muted small">No incluido salvo acuerdo expreso: dominio, hosting, licencias, servicios externos, comisiones de pago, carga masiva de productos y funcionalidades adicionales.</p>
      <button class="btn btn-primary" type="submit" form="checkout-form" style="width:100%" data-submit></button>
      <p class="muted small" style="margin:12px 0 18px">${icon('lock', 14).replace('class="i"', 'class="i" style="display:inline;vertical-align:-2px"')} El pago se hace en la página segura de Stripe. Nunca vemos ni guardamos los datos de tu tarjeta.</p>
      <a class="btn btn-call" href="reservas.html" style="width:100%">${icon('calendar', 18)}<span>Agendar una llamada</span></a>
    </aside>
  </div>`;

  const form = $('#checkout-form');
  const totals = $('[data-totals]');
  const submit = $('[data-submit]');

  function update() {
    const mode = form.elements.mode.value;
    const mSlug = form.elements.maintenance?.value ?? '';
    const plan = content.maintenance.find((m) => m.slug === mSlug);
    totals.innerHTML = `
      <div><span>${esc(pkg.name)}</span><span>${euros(pkg.price_cents)}</span></div>
      ${plan ? `<div><span>${esc(plan.name)} (mensual, se cobra aparte)</span><span>${euros(plan.price_cents, { from: plan.price_from, monthly: true })}</span></div>` : ''}
      <div class="grand"><span>${mode === 'quote' ? 'A pagar ahora' : deposit ? `Señal ahora (${pct}%)` : 'A pagar ahora'}</span><span>${mode === 'quote' ? '0 €' : euros(dueNow)}</span></div>
      ${mode !== 'quote' && deposit ? `<div class="muted small"><span>Pendiente según condiciones</span><span>${euros(pkg.price_cents - dueNow)}</span></div>` : ''}`;
    submit.textContent = mode === 'quote' ? 'Solicitar presupuesto definitivo' : 'Continuar al pago seguro';
  }
  form.addEventListener('change', update);
  update();

  const started = Date.now();
  // La misma clave en los reintentos evita contrataciones duplicadas.
  let key = newKey();
  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    clearErrors(form);
    const fd = new FormData(form);
    const body = {
      package: pkg.slug,
      maintenance: String(fd.get('maintenance') ?? ''),
      requirements: String(fd.get('requirements') ?? '').trim(),
      mode: String(fd.get('mode')),
      name: String(fd.get('name') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim(),
      acceptTerms: fd.get('acceptTerms') === 'on',
      acceptPrivacy: fd.get('acceptPrivacy') === 'on',
      website: String(fd.get('website') ?? ''),
      leadToken: leadToken(),
      submissionKey: key,
      startedAt: started,
    };
    if (body.name.length < 2) return setFieldError(form, 'name', 'Escribe tu nombre.');
    if (!/^\S+@\S+\.\S+$/.test(body.email)) return setFieldError(form, 'email', 'Revisa el correo: no parece válido.');
    if (!body.acceptTerms) return setFieldError(form, 'acceptTerms', 'Debes aceptar las condiciones de contratación.');
    if (!body.acceptPrivacy) return setFieldError(form, 'acceptPrivacy', 'Debes aceptar la política de privacidad.');

    sending = true;
    setBusy(submit, true, body.mode === 'quote' ? 'Enviando…' : 'Preparando el pago…');
    try {
      const res = await callFunction('checkout', body);
      location.assign(res.redirect);
    } catch (err) {
      if (err.field) setFieldError(form, err.field, err.message);
      else form.querySelector('.form-error').textContent = err.message;
      // 502: el pedido quedó registrado como «pago fallido»; un nuevo intento crea otro.
      if (err.status === 502) key = newKey();
      sending = false;
      setBusy(submit, false);
      update();
    }
  });
}
