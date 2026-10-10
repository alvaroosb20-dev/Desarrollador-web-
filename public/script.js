// Página principal: contenido editable, galería, planes, preguntas y contacto.
import {
  $,
  $$,
  SERVICE_ICONS,
  boot,
  callFunction,
  clearErrors,
  esc,
  euros,
  gateEnabled,
  icon,
  leadDone,
  newKey,
  setBusy,
  setFieldError,
  whatsappLink,
} from './assets/js/common.js';
import { renderMock } from './assets/js/demos.js';
import { initWizard, openWizard } from './assets/js/wizard.js';

const CALL = `${icon('calendar', 18)}<span>Agendar una llamada</span>`;
$$('[data-call]').forEach((a) => (a.innerHTML = CALL));

// El formulario obligatorio se abre antes de cargar nada más.
initWizard();
if (gateEnabled() && !leadDone()) openWizard({ mandatory: true });
else document.documentElement.classList.remove('gate');

$$('[data-open-wizard]').forEach((b) => b.addEventListener('click', () => openWizard({ mandatory: false })));

const content = await boot({ home: true });
const s = content.settings;

// ---------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------
$('[data-hero-title]').textContent = s.hero_title;
$('[data-hero-subtitle]').textContent = s.hero_subtitle;
$('[data-hero-note]').innerHTML = [
  ['shield', 'Precio cerrado antes de empezar'],
  ['check', 'Publicamos solo con tu aprobación'],
  ['lock', 'La web es tuya'],
]
  .map(([i, t]) => `<span>${icon(i, 16)}${esc(t)}</span>`)
  .join('');
if (s.seo_title) document.title = s.seo_title;
if (s.seo_description) document.querySelector('meta[name=description]')?.setAttribute('content', s.seo_description);

// Navegador de la portada: recorre los diseños de demostración (el único movimiento automático de la página).
const demos = content.demos;
const stage = $('[data-showcase]');
const pager = $('[data-pager]');
stage.innerHTML = demos.map(renderMock).join('');
pager.innerHTML = demos.map((d, i) => `<button type="button" aria-label="Ver ${esc(d.sector)}" data-i="${i}"></button>`).join('');
const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
let current = 0;
function show(i) {
  current = (i + demos.length) % demos.length;
  $$('.mock', stage).forEach((m, k) => m.classList.toggle('on', k === current));
  $$('button', pager).forEach((b, k) => b.setAttribute('aria-current', String(k === current)));
  $('[data-caption]').textContent = `Diseño de demostración para ${demos[current].sector.toLowerCase()}`;
  $('[data-showcase-url]').textContent = slug(demos[current].title);
}
show(0);
pager.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  show(Number(b.dataset.i));
  restart();
});
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let timer;
function restart() {
  clearInterval(timer);
  if (!reduced && demos.length > 1) timer = setInterval(() => !document.hidden && show(current + 1), 4200);
}
restart();

// ---------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------
$('[data-services]').innerHTML = s.services
  .map(
    (svc) => `<article class="service">
      ${icon(SERVICE_ICONS[svc.key] ?? 'monitor', 26)}
      <h3>${esc(svc.title)}</h3>
      <p>${esc(svc.description)}</p>
      <button class="btn-link" type="button" data-ask="${esc(svc.title)}">Solicitar información</button>
    </article>`,
  )
  .join('');

const topicSelect = $('[data-topics]');
topicSelect.innerHTML += s.services.map((svc) => `<option>${esc(svc.title)}</option>`).join('');
$('[data-services]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ask]');
  if (!b) return;
  topicSelect.value = b.dataset.ask;
  const msg = $('#c-message');
  if (!msg.value) msg.value = `Hola, me interesa: ${b.dataset.ask}. `;
  $('#contacto').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  setTimeout(() => $('#c-name').focus({ preventScroll: true }), reduced ? 0 : 500);
});

// ---------------------------------------------------------------------
// Cómo trabajamos
// ---------------------------------------------------------------------
$('[data-steps]').innerHTML = s.process_steps
  .map((st) => `<li><h3>${esc(st.title)}</h3><p>${esc(st.description)}</p></li>`)
  .join('');

// ---------------------------------------------------------------------
// Planes y mantenimiento
// ---------------------------------------------------------------------
$('[data-plans]').innerHTML = content.packages
  .map((p) => {
    const features = Array.isArray(p.features) ? p.features : [];
    return `<article class="plan ${p.highlighted ? 'highlight' : ''}">
      ${p.badge ? `<span class="plan-badge">${esc(p.badge)}</span>` : ''}
      <h3>${esc(p.name)}</h3>
      <p class="plan-audience">${esc(p.audience ?? p.description ?? '')}</p>
      <div class="plan-price">${euros(p.price_cents)}<small>pago único</small></div>
      <ul>${features.map((f) => `<li>${icon('check', 16)}<span>${esc(f)}</span></li>`).join('')}</ul>
      <a class="btn ${p.highlighted ? 'btn-primary' : 'btn-ghost'}" href="contratar.html?plan=${encodeURIComponent(p.slug)}">${esc(p.cta_label || `Contratar ${p.name}`)}</a>
    </article>`;
  })
  .join('');
$('[data-pricing-note]').textContent = s.pricing_note ?? '';

$('[data-maintenance]').innerHTML = content.maintenance
  .map((m) => {
    const features = Array.isArray(m.features) ? m.features : [];
    return `<div class="maint-row">
      <div><h4>${esc(m.name)}</h4><div class="price">${euros(m.price_cents, { from: m.price_from, monthly: true })}</div></div>
      <ul>${features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <div class="limits"><strong>Límites del servicio</strong>${esc(m.limits ?? '')}${m.response_time ? `<br>${esc(m.response_time)}` : ''}</div>
    </div>`;
  })
  .join('');

// ---------------------------------------------------------------------
// Portafolio
// ---------------------------------------------------------------------
$('[data-demos]').innerHTML = demos
  .map(
    (d) => `<article class="demo">
      <div class="demo-frame"><div class="dots"><i></i><i></i><i></i></div><div class="mock-box">${renderMock(d)}</div></div>
      <div><span class="demo-tag">Demostración para ${esc(d.sector.toLowerCase())}</span><h3>${esc(d.title)}</h3><p>${esc(d.description ?? '')}</p></div>
    </article>`,
  )
  .join('');

// ---------------------------------------------------------------------
// Preguntas frecuentes
// ---------------------------------------------------------------------
$('[data-faqs]').innerHTML = content.faqs
  .map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`)
  .join('');

// ---------------------------------------------------------------------
// Contacto
// ---------------------------------------------------------------------
const ways = [];
const wa = whatsappLink(s.whatsapp, 'Hola, me gustaría información sobre una página web.');
if (wa) ways.push(`<a class="contact-way" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat')}<span>WhatsApp<small>${esc(s.whatsapp)}</small></span></a>`);
if (s.contact_email) ways.push(`<a class="contact-way" href="mailto:${esc(s.contact_email)}">${icon('mail')}<span>Correo electrónico<small>${esc(s.contact_email)}</small></span></a>`);
$('[data-contact-ways]').innerHTML = ways.join('');
if (wa) {
  const f = document.createElement('a');
  f.className = 'wa-float';
  f.href = wa;
  f.target = '_blank';
  f.rel = 'noopener';
  f.setAttribute('aria-label', 'Escríbenos por WhatsApp');
  f.innerHTML = icon('chat', 24);
  document.body.appendChild(f);
}

const contactForm = $('#contact-form');
const contactStarted = Date.now();
let contactKey = newKey();
let contactSending = false;
contactForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (contactSending) return;
  clearErrors(contactForm);
  const fd = new FormData(contactForm);
  const body = {
    type: 'contact',
    name: String(fd.get('name') ?? '').trim(),
    email: String(fd.get('email') ?? '').trim(),
    phone: String(fd.get('phone') ?? '').trim(),
    topic: String(fd.get('topic') ?? ''),
    message: String(fd.get('message') ?? '').trim(),
    privacy: fd.get('privacy') === 'on',
    website: String(fd.get('website') ?? ''),
    submissionKey: contactKey,
    startedAt: contactStarted,
  };
  if (body.name.length < 2) return setFieldError(contactForm, 'name', 'Escribe tu nombre.');
  if (!/^\S+@\S+\.\S+$/.test(body.email)) return setFieldError(contactForm, 'email', 'Revisa el correo: no parece válido.');
  if (body.message.length < 10) return setFieldError(contactForm, 'message', 'Cuéntanos un poco más (mínimo 10 caracteres).');
  if (!body.privacy) return setFieldError(contactForm, 'privacy', 'Debes aceptar la política de privacidad.');

  const btn = contactForm.querySelector('button[type=submit]');
  contactSending = true;
  setBusy(btn, true, 'Enviando…');
  try {
    await callFunction('forms', body);
    contactForm.innerHTML = `<div class="success-box" role="status" tabindex="-1">
      <h3>Mensaje enviado</h3><p class="muted" style="margin:0">Te responderemos lo antes posible al correo que nos has indicado.</p></div>`;
    contactForm.querySelector('.success-box').focus();
    contactKey = newKey();
  } catch (err) {
    if (err.field) setFieldError(contactForm, err.field, err.message);
    else contactForm.querySelector('.form-error').textContent = err.message;
  } finally {
    contactSending = false;
    if (btn.isConnected) setBusy(btn, false);
  }
});
