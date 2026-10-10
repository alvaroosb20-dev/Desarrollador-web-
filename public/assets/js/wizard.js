// Formulario inicial: asistente con UNA pregunta por pantalla.
// · El progreso se guarda en sessionStorage (se borra al cerrar la pestaña y al enviar).
// · Solo se confirma el envío cuando el servidor responde que la solicitud está guardada.
// · Tras enviarlo se guarda un comprobante firmado (sin datos personales) para no repetirlo.
import { $, ApiError, callFunction, esc, icon, newKey, setBusy, setLead, store } from './common.js';
import {
  BUDGETS,
  BUSINESS_TYPES,
  CONTENT_STATUS,
  GOALS,
  NO_NAME,
  QUESTIONS,
  TIMELINES,
  WEBSITE_TYPES,
  labelOf,
  validateEmail,
  validateName,
  validatePhone,
} from './wizard-data.js';

const SKEY = 'wqv_wizard';
const ORDER = ['welcome', 'name', 'businessName', 'businessType', 'websiteType', 'goal', 'budget', 'contentStatus', 'timeline', 'contact', 'summary', 'done'];
const QUESTION_STEPS = ORDER.slice(1, 10); // 9 preguntas
const CHOICE_STEPS = {
  businessType: { options: BUSINESS_TYPES, cols: 'three', hint: 'Elige la opción que mejor te describa.' },
  websiteType: { options: WEBSITE_TYPES, hint: 'Si no lo tienes claro, te asesoramos sin compromiso.' },
  goal: { options: GOALS, hint: 'El objetivo principal decide cómo diseñamos la web.' },
  budget: { options: BUDGETS, hint: 'Nos ayuda a proponerte una solución realista.' },
  contentStatus: { options: CONTENT_STATUS, hint: 'Textos, fotos, logotipo… Podemos ayudarte con lo que falte.' },
  timeline: { options: TIMELINES, hint: 'Te confirmaremos un plazo concreto antes de empezar.' },
};
const FIELD_STEP = {
  name: 'name',
  businessName: 'businessName',
  businessType: 'businessType',
  websiteType: 'websiteType',
  goal: 'goal',
  budget: 'budget',
  contentStatus: 'contentStatus',
  timeline: 'timeline',
  email: 'contact',
  phone: 'contact',
  privacy: 'contact',
};

const empty = () => ({
  name: '',
  businessName: '',
  businessType: '',
  websiteType: '',
  goal: '',
  budget: '',
  contentStatus: '',
  timeline: '',
  email: '',
  phone: '',
  privacy: false,
  marketing: false,
});

let state;
let mandatory = false;
let sending = false;
let onFinish = () => {};

function load() {
  try {
    const saved = JSON.parse(store.get('sessionStorage', SKEY) ?? 'null');
    if (saved && ORDER.includes(saved.step) && saved.answers) return { ...saved, answers: { ...empty(), ...saved.answers }, error: null };
  } catch {
    /* empezar de cero */
  }
  return { step: 'welcome', answers: empty(), submissionKey: newKey(), startedAt: Date.now(), editing: false, error: null };
}
const save = () => {
  if (state.step === 'done') store.del('sessionStorage', SKEY);
  else store.set('sessionStorage', SKEY, JSON.stringify({ ...state, error: null }));
};

const root = () => $('#wizard');
const form = () => $('[data-wizard-step]');

// ---------------------------------------------------------------------
// Pintado de cada paso
// ---------------------------------------------------------------------
function actions({ back = true, next = 'Continuar', hint = true } = {}) {
  return `<div class="wizard-actions">
      ${back ? `<button class="btn btn-ghost" type="button" data-back>${icon('back', 18)}<span>Atrás</span></button>` : ''}
      <button class="btn btn-primary" type="submit">${esc(next)}</button>
      ${hint ? '<span class="kbd-hint">o pulsa Intro</span>' : ''}
    </div>`;
}
const err = (id, msg = '') => `<p class="err" id="${id}-err" role="alert">${esc(msg)}</p>`;

function choiceStep(key) {
  const def = CHOICE_STEPS[key];
  const v = state.answers[key];
  return `<h2 id="wizard-title" tabindex="-1">${esc(QUESTIONS[key])}<span class="req" aria-hidden="true">*</span></h2>
    <p class="hint">${esc(def.hint)}</p>
    <fieldset class="choices ${def.cols ?? ''}" aria-describedby="choice-err" aria-required="true">
      <legend class="sr-only">${esc(QUESTIONS[key])}</legend>
      ${def.options
        .map(
          (o) => `<label class="choice"><input type="radio" name="${key}" value="${esc(o.value)}" ${o.value === v ? 'checked' : ''} required>
            <span class="tick">${icon('check', 14)}</span><span class="t">${esc(o.label)}</span></label>`,
        )
        .join('')}
    </fieldset>
    ${err('choice', state.error)}
    ${actions()}`;
}

const VIEWS = {
  welcome: () => `<div class="welcome">
      <h2 id="wizard-title" tabindex="-1">Vamos a crear la web que tu negocio necesita</h2>
      <p class="lead">Responde a unas sencillas preguntas y encontraremos la mejor solución para tu proyecto.</p>
      <div class="wizard-actions"><button class="btn btn-primary" type="submit">Empezar</button><span class="kbd-hint">Son 9 preguntas, menos de 2 minutos</span></div>
    </div>`,
  name: () => `<h2 id="wizard-title" tabindex="-1"><label for="w-name">${esc(QUESTIONS.name)}<span class="req" aria-hidden="true">*</span></label></h2>
    <p class="hint">Para saber cómo dirigirnos a ti.</p>
    <input class="input big" id="w-name" name="name" autocomplete="name" maxlength="80" required value="${esc(state.answers.name)}" aria-describedby="name-err" ${state.error ? 'aria-invalid="true"' : ''}>
    ${err('name', state.error)}${actions()}`,
  businessName: () => {
    const none = state.answers.businessName === NO_NAME;
    return `<h2 id="wizard-title" tabindex="-1"><label for="w-bn">${esc(QUESTIONS.businessName)}<span class="req" aria-hidden="true">*</span></label></h2>
    <p class="hint">Si todavía no tiene nombre, no pasa nada.</p>
    <input class="input big" id="w-bn" name="businessName" autocomplete="organization" maxlength="120" value="${none ? '' : esc(state.answers.businessName)}" ${none ? 'disabled' : ''} aria-describedby="bn-err">
    <label class="check" style="margin-top:16px"><input type="checkbox" name="noName" ${none ? 'checked' : ''}><span>Todavía no tengo nombre</span></label>
    ${err('bn', state.error)}${actions()}`;
  },
  contact: () => {
    const a = state.answers;
    return `<h2 id="wizard-title" tabindex="-1">${esc(QUESTIONS.contact)}</h2>
    <p class="hint">Solo usaremos estos datos para responder a tu solicitud.</p>
    <div class="form">
      <div class="field"><label for="w-cname">Nombre<span class="req" aria-hidden="true">*</span></label>
        <input class="input" id="w-cname" name="name" autocomplete="name" maxlength="80" required value="${esc(a.name)}"></div>
      <div class="row-2">
        <div class="field"><label for="w-email">Correo electrónico<span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="w-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required value="${esc(a.email)}"></div>
        <div class="field"><label for="w-phone">Teléfono o WhatsApp<span class="opt">(opcional)</span></label>
          <input class="input" id="w-phone" name="phone" type="tel" autocomplete="tel" maxlength="30" value="${esc(a.phone)}"></div>
      </div>
      <label class="check"><input type="checkbox" name="privacy" ${a.privacy ? 'checked' : ''} required><span>He leído y acepto la <a href="politica-privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.<span class="req" aria-hidden="true">*</span></span></label>
      <label class="check"><input type="checkbox" name="marketing" ${a.marketing ? 'checked' : ''}><span>Quiero recibir novedades y ofertas por correo. Es opcional y puedes darte de baja cuando quieras.</span></label>
    </div>
    <div class="hp" aria-hidden="true"><label>No rellenar <input name="website" tabindex="-1" autocomplete="off"></label></div>
    ${err('contact', state.error)}${actions()}`;
  },
  summary: () => {
    const a = state.answers;
    const rows = [
      ['name', 'Nombre', a.name],
      ['businessName', 'Negocio o proyecto', a.businessName === NO_NAME ? 'Todavía no tengo nombre' : a.businessName],
      ['businessType', 'Tipo de negocio', labelOf(BUSINESS_TYPES, a.businessType)],
      ['websiteType', 'Tipo de web', labelOf(WEBSITE_TYPES, a.websiteType)],
      ['goal', 'Objetivo', labelOf(GOALS, a.goal)],
      ['budget', 'Presupuesto', labelOf(BUDGETS, a.budget)],
      ['contentStatus', 'Contenido', labelOf(CONTENT_STATUS, a.contentStatus)],
      ['timeline', 'Plazo', labelOf(TIMELINES, a.timeline)],
      ['contact', 'Correo electrónico', a.email],
      ['contact', 'Teléfono o WhatsApp', a.phone || 'No indicado'],
      ['contact', 'Comunicaciones comerciales', a.marketing ? 'Sí' : 'No'],
    ];
    return `<h2 id="wizard-title" tabindex="-1">Revisa tu solicitud</h2>
    <p class="hint">Puedes corregir cualquier respuesta antes de enviarla.</p>
    <dl class="summary">${rows
      .map(
        ([step, k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd><button class="btn-link" type="button" data-edit="${step}" aria-label="Cambiar ${esc(k.toLowerCase())}">Cambiar</button></div>`,
      )
      .join('')}</dl>
    <p class="form-error" role="alert">${esc(state.error ?? '')}</p>
    ${actions({ next: 'Enviar solicitud', hint: false })}`;
  },
  done: () => `<div class="done-mark">${icon('check', 30)}</div>
    <h2 id="wizard-title" tabindex="-1">¡Perfecto! Hemos recibido tu solicitud</h2>
    <p class="lead" style="margin:16px 0 34px">Gracias por confiar en nosotros. Revisaremos tu proyecto y nos pondremos en contacto contigo.</p>
    <div class="wizard-actions">
      <button class="btn btn-primary" type="button" data-see-plans>Ver nuestros planes</button>
      <a class="btn btn-call" href="reservas.html">${icon('calendar', 18)}<span>Agendar una llamada</span></a>
    </div>`,
};

function render(direction = 'forward') {
  const f = form();
  const step = state.step;
  f.innerHTML = CHOICE_STEPS[step] ? choiceStep(step) : VIEWS[step]();
  f.classList.remove('enter', 'enter-back');
  void f.offsetWidth; // reinicia la animación
  if (direction !== 'none') f.classList.add(direction === 'back' ? 'enter-back' : 'enter');

  // Progreso y contador
  const idx = ORDER.indexOf(step);
  const pct = step === 'done' ? 100 : Math.round((Math.max(0, idx) / 10) * 100);
  const bar = $('.progress', root());
  bar.setAttribute('aria-valuenow', String(pct));
  $('span', bar).style.width = `${pct}%`;
  const qi = QUESTION_STEPS.indexOf(step);
  $('[data-wizard-count]').textContent =
    qi >= 0 ? `Pregunta ${qi + 1} de ${QUESTION_STEPS.length}` : step === 'summary' ? 'Revisión final' : '';

  // Foco: primer campo vacío o el título
  const target = f.querySelector('input.input:not([disabled])') ?? f.querySelector('input:checked') ?? f.querySelector('h2');
  if (state.error) (f.querySelector('[aria-invalid="true"]') ?? f.querySelector('input:not([type=hidden])') ?? f.querySelector('h2'))?.focus();
  else if (target) target.focus({ preventScroll: true });
  root().scrollTop = 0;
  save();
}

function go(step, direction = 'forward') {
  state.step = step;
  state.error = null;
  render(direction);
}
function next() {
  if (state.editing && state.step !== 'summary') {
    state.editing = false;
    return go('summary');
  }
  go(ORDER[ORDER.indexOf(state.step) + 1]);
}
function back() {
  if (state.editing) {
    state.editing = false;
    return go('summary', 'back');
  }
  const i = ORDER.indexOf(state.step);
  if (i > 0) go(ORDER[i - 1], 'back');
}
function showError(msg) {
  state.error = msg;
  render('none');
}

// ---------------------------------------------------------------------
// Validación de cada paso
// ---------------------------------------------------------------------
function collect() {
  const f = form();
  const a = state.answers;
  const step = state.step;
  if (step === 'name') {
    a.name = f.elements.name.value.trim();
    return validateName(a.name);
  }
  if (step === 'businessName') {
    if (f.elements.noName.checked) a.businessName = NO_NAME;
    else a.businessName = f.elements.businessName.value.trim();
    return a.businessName ? null : 'Escribe el nombre o marca «Todavía no tengo nombre».';
  }
  if (CHOICE_STEPS[step]) {
    const sel = f.querySelector(`input[name="${step}"]:checked`);
    if (!sel) return 'Elige una opción para continuar.';
    a[step] = sel.value;
    return null;
  }
  if (step === 'contact') {
    a.name = f.elements.name.value.trim();
    a.email = f.elements.email.value.trim();
    a.phone = f.elements.phone.value.trim();
    a.privacy = f.elements.privacy.checked;
    a.marketing = f.elements.marketing.checked;
    state.honeypot = f.elements.website.value;
    return (
      validateName(a.name) ??
      validateEmail(a.email) ??
      validatePhone(a.phone) ??
      (a.privacy ? null : 'Para enviar la solicitud debes aceptar la política de privacidad.')
    );
  }
  return null;
}

async function submit() {
  if (sending) return; // protección contra doble envío
  sending = true;
  const btn = form().querySelector('button[type=submit]');
  setBusy(btn, true, 'Enviando…');
  try {
    const res = await callFunction('forms', {
      type: 'lead',
      answers: state.answers,
      submissionKey: state.submissionKey,
      startedAt: state.startedAt,
      website: state.honeypot ?? '',
    });
    setLead(res.leadToken);
    state.step = 'done';
    store.del('sessionStorage', SKEY);
    render();
    $('[data-wizard-close]').hidden = false;
    unlockSite();
  } catch (e) {
    const field = e instanceof ApiError ? e.field : null;
    if (field && FIELD_STEP[field]) {
      state.step = FIELD_STEP[field];
      showError(e.message);
    } else {
      showError(e.message || 'No hemos podido enviar tu solicitud. Inténtalo de nuevo.');
    }
  } finally {
    sending = false;
  }
}

// ---------------------------------------------------------------------
// Apertura y cierre
// ---------------------------------------------------------------------
function lockSite() {
  const site = $('#site');
  site.inert = true;
  site.setAttribute('aria-hidden', 'true');
  document.body.classList.add('gated');
}
function unlockSite() {
  document.documentElement.classList.remove('gate');
  const site = $('#site');
  site.inert = false;
  site.removeAttribute('aria-hidden');
}

export function closeWizard() {
  if (mandatory && state.step !== 'done') return;
  root().classList.remove('open');
  document.body.classList.remove('gated');
  unlockSite();
  if (state.step === 'done') {
    state = { step: 'welcome', answers: empty(), submissionKey: newKey(), startedAt: Date.now(), editing: false, error: null };
  }
  onFinish();
}

/** @param {{mandatory?: boolean, onClose?: () => void}} opts */
export function openWizard(opts = {}) {
  mandatory = Boolean(opts.mandatory);
  onFinish = opts.onClose ?? (() => {});
  state = load();
  if (state.step === 'done') state.step = 'welcome';
  const closeBtn = $('[data-wizard-close]');
  closeBtn.innerHTML = icon('close', 20);
  closeBtn.hidden = mandatory;
  root().classList.add('open');
  lockSite();
  render();
}

export function initWizard() {
  const f = form();
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.step === 'summary') return submit();
    if (state.step === 'done') return;
    const problem = collect();
    if (problem) return showError(problem);
    next();
  });
  f.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) back();
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      state.editing = true;
      go(edit.dataset.edit, 'back');
    }
    if (e.target.closest('[data-see-plans]')) {
      closeWizard();
      document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' });
    }
  });
  f.addEventListener('change', (e) => {
    if (e.target.name === 'noName') {
      const input = f.elements.businessName;
      input.disabled = e.target.checked;
      if (!e.target.checked) input.focus();
    }
    // Al elegir una opción se borra el error del paso.
    if (e.target.type === 'radio' && state.error) {
      state.error = null;
      const holder = f.querySelector('.err');
      if (holder) holder.textContent = '';
    }
  });
  $('[data-wizard-close]').addEventListener('click', closeWizard);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root().classList.contains('open')) closeWizard();
  });
}
