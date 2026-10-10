// Utilidades compartidas por todas las páginas públicas (JavaScript puro, sin dependencias).
import { DEFAULTS } from './defaults.js';

const CFG = window.WQV_CONFIG ?? {};
export const SUPABASE_URL = String(CFG.SUPABASE_URL ?? '').replace(/\/+$/, '');
export const ANON_KEY = String(CFG.SUPABASE_ANON_KEY ?? '');
export const configured = () => Boolean(SUPABASE_URL && ANON_KEY);
export const gateEnabled = () => CFG.LEAD_GATE !== false && configured();

// ---------------------------------------------------------------------
// Texto y formato
// ---------------------------------------------------------------------
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function euros(cents, { from = false, monthly = false } = {}) {
  const v = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
  return `${from ? 'desde ' : ''}${v}${monthly ? '/mes' : ''}`;
}

export function whatsappLink(number, text) {
  const digits = String(number ?? '').replace(/[^\d]/g, '');
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const newKey = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** Lectura/escritura segura de almacenamiento (puede no estar disponible en modo privado). */
export const store = {
  get(area, k) {
    try {
      return window[area].getItem(k);
    } catch {
      return null;
    }
  },
  set(area, k, v) {
    try {
      window[area].setItem(k, v);
    } catch {
      /* sin almacenamiento: la web sigue funcionando */
    }
  },
  del(area, k) {
    try {
      window[area].removeItem(k);
    } catch {
      /* nada */
    }
  },
};

// ---------------------------------------------------------------------
// Comprobante del formulario inicial (solo id de la solicitud + firma, sin datos personales)
// ---------------------------------------------------------------------
const LEAD_KEY = 'wqv_lead';
export const leadDone = () => Boolean(store.get('localStorage', LEAD_KEY));
export const leadToken = () => {
  const v = store.get('localStorage', LEAD_KEY);
  return v && v.includes('.') ? v : undefined;
};
export const setLead = (token) => store.set('localStorage', LEAD_KEY, token || 'completado');

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message, { status = 0, field } = {}) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

/** Llama a una Edge Function. Nunca da por buena una operación si el servidor no la confirma. */
export async function callFunction(name, body, { method = 'POST', query = '' } = {}) {
  if (!configured()) {
    throw new ApiError('Este formulario todavía no está conectado a la base de datos. Escríbenos directamente mientras tanto.', { status: 503 });
  }
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}${query}`, {
      method,
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, ...(ANON_KEY.split('.').length === 3 ? { Authorization: `Bearer ${ANON_KEY}` } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No hay conexión con el servidor. Comprueba tu conexión a Internet e inténtalo de nuevo.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta vacía */
  }
  if (!res.ok || !data || data.ok === false) {
    throw new ApiError(data?.error || 'No hemos podido completar la operación. Inténtalo de nuevo en unos segundos.', {
      status: res.status,
      field: data?.field,
    });
  }
  return data;
}

async function restGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, ...(ANON_KEY.split('.').length === 3 ? { Authorization: `Bearer ${ANON_KEY}` } : {}) },
  });
  if (!res.ok) throw new Error(`REST ${res.status}`);
  return res.json();
}

/** Contenido público editable desde el panel. Si la base de datos no responde, usa el contenido por defecto. */
let contentPromise;
export function loadContent() {
  if (contentPromise) return contentPromise;
  contentPromise = (async () => {
    const out = { ...DEFAULTS, settings: { ...DEFAULTS.settings }, live: false, booking: null };
    if (!configured()) return out;
    const tasks = {
      settings: restGet('site_settings?select=*&id=eq.1'),
      packages: restGet('packages?select=*&active=is.true&order=sort'),
      maintenance: restGet('maintenance_plans?select=*&active=is.true&order=sort'),
      addons: restGet('addons?select=*&active=is.true&order=sort'),
      faqs: restGet('faqs?select=*&active=is.true&order=sort'),
      demos: restGet('demo_projects?select=*&active=is.true&order=sort'),
      booking: restGet('booking_settings?select=enabled,duration_min,timezone&id=eq.1'),
    };
    const entries = await Promise.allSettled(Object.values(tasks));
    Object.keys(tasks).forEach((k, i) => {
      const r = entries[i];
      if (r.status !== 'fulfilled') return;
      if (k === 'settings') {
        if (r.value[0]) {
          const s = r.value[0];
          out.settings = {
            ...DEFAULTS.settings,
            ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null && v !== '')),
            services: Array.isArray(s.services) && s.services.length ? s.services : DEFAULTS.settings.services,
            process_steps: Array.isArray(s.process_steps) && s.process_steps.length ? s.process_steps : DEFAULTS.settings.process_steps,
          };
          out.live = true;
        }
      } else if (k === 'booking') {
        out.booking = r.value[0] ?? null;
      } else if (Array.isArray(r.value) && (r.value.length || k === 'addons')) {
        out[k] = r.value;
      }
    });
    return out;
  })();
  return contentPromise;
}

// ---------------------------------------------------------------------
// Iconos (SVG en línea, heredan el color del texto)
// ---------------------------------------------------------------------
const P = {
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  phone: '<path d="M5 4h3.2l1.6 4.2-2 1.3a11 11 0 0 0 6.7 6.7l1.3-2 4.2 1.6V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
  chat: '<path d="M4 18.5l1.2-3.6A8 8 0 1 1 9 18.6z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  monitor: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>',
  bag: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3.5l7.5 3v5.7c0 4.3-3.2 7.6-7.5 8.8-4.3-1.2-7.5-4.5-7.5-8.8V6.5z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
};
export function icon(name, size = 20) {
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}
export const SERVICE_ICONS = { diseno: 'monitor', tiendas: 'bag', landing: 'target', renovacion: 'refresh', reservas: 'calendar', mantenimiento: 'shield' };

// ---------------------------------------------------------------------
// Marca: nombre, logotipo y color de acento configurables
// ---------------------------------------------------------------------
function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#17140c';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#17140c' : '#ffffff';
}

export function applyBrand(settings) {
  const root = document.documentElement;
  if (/^#[0-9a-f]{6}$/i.test(settings.accent_color ?? '')) {
    root.style.setProperty('--accent', settings.accent_color);
    root.style.setProperty('--on-accent', readableOn(settings.accent_color));
  }
  $$('[data-brand]').forEach((el) => (el.textContent = settings.business_name));
  $$('[data-logo]').forEach((el) => {
    el.innerHTML = settings.logo_url
      ? `<img src="${esc(settings.logo_url)}" alt="${esc(settings.business_name)}" height="30">`
      : `<span class="logo-mark" aria-hidden="true"></span><span class="logo-text">${esc(settings.business_name)}</span>`;
  });
}

// ---------------------------------------------------------------------
// Cabecera y pie comunes
// ---------------------------------------------------------------------
const callButton = (extra = '') =>
  `<a class="btn btn-call ${extra}" href="reservas.html">${icon('calendar', 18)}<span>Agendar una llamada</span></a>`;
export { callButton };

export function mountChrome({ home = false } = {}) {
  const prefix = home ? '' : 'index.html';
  const header = $('[data-site-header]');
  if (header) {
    header.innerHTML = `
      <div class="wrap header-in">
        <a class="logo" href="index.html" data-logo aria-label="Inicio"></a>
        <nav class="nav" id="nav" aria-label="Principal">
          <a href="${prefix}#servicios">Servicios</a>
          <a href="${prefix}#proceso">Cómo trabajamos</a>
          <a href="${prefix}#planes">Planes</a>
          <a href="${prefix}#portafolio">Diseños</a>
          <a href="${prefix}#preguntas">Preguntas</a>
          <a href="${prefix}#contacto">Contacto</a>
        </nav>
        <div class="header-actions">
          ${callButton('btn-sm')}
          <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav" aria-label="Abrir menú">${icon('menu', 22)}</button>
        </div>
      </div>`;
    const btn = $('.menu-btn', header);
    btn.addEventListener('click', () => {
      const open = header.classList.toggle('menu-open');
      btn.setAttribute('aria-expanded', String(open));
      btn.innerHTML = icon(open ? 'close' : 'menu', 22);
    });
    $$('.nav a', header).forEach((a) =>
      a.addEventListener('click', () => {
        header.classList.remove('menu-open');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = icon('menu', 22);
      }),
    );
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  const footer = $('[data-site-footer]');
  if (footer) {
    footer.innerHTML = `
      <div class="wrap footer-in">
        <div class="footer-brand">
          <a class="logo" href="index.html" data-logo></a>
          <p class="muted" data-footer-text>Diseño y desarrollo de páginas web para negocios.</p>
        </div>
        <nav class="footer-links" aria-label="Información legal">
          <a href="aviso-legal.html">Aviso legal</a>
          <a href="politica-privacidad.html">Política de privacidad</a>
          <a href="cookies.html">Política de cookies</a>
          <a href="condiciones.html">Condiciones de contratación</a>
        </nav>
        <p class="muted small">© ${new Date().getFullYear()} <span data-brand></span></p>
      </div>`;
  }
}

/** Arranque común: cabecera, marca, aviso de configuración y consentimiento de cookies. */
export async function boot(opts = {}) {
  mountChrome(opts);
  applyBrand(DEFAULTS.settings);
  const content = await loadContent();
  applyBrand(content.settings);
  if (content.settings.footer_text) $$('[data-footer-text]').forEach((el) => (el.textContent = content.settings.footer_text));
  if (!configured()) showSetupNotice();
  initConsent(content.settings);
  return content;
}

function showSetupNotice() {
  if ($('.setup-notice')) return;
  const n = document.createElement('div');
  n.className = 'setup-notice';
  n.setAttribute('role', 'status');
  n.innerHTML =
    'Vista previa sin conexión: falta configurar Supabase en <code>config.js</code>. Los formularios, reservas y pagos no funcionarán hasta entonces.';
  document.body.prepend(n);
}

// ---------------------------------------------------------------------
// Consentimiento de cookies. La web solo usa almacenamiento técnico; el banner
// aparece únicamente si se configura una herramienta de analítica en el panel.
// ---------------------------------------------------------------------
const CONSENT_KEY = 'wqv_consent';
export function getConsent() {
  try {
    return JSON.parse(store.get('localStorage', CONSENT_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function loadAnalytics(url) {
  if (!url || document.querySelector('script[data-analytics]')) return;
  const s = document.createElement('script');
  s.src = url;
  s.async = true;
  s.dataset.analytics = '1';
  document.head.appendChild(s);
}
export function openConsentBanner(settings) {
  const url = settings?.analytics_snippet_url;
  $('.consent')?.remove();
  const box = document.createElement('section');
  box.className = 'consent';
  box.setAttribute('aria-label', 'Preferencias de cookies');
  box.innerHTML = url
    ? `<p>Usamos una herramienta de analítica para saber cómo se usa la web. Solo se activa si la aceptas. <a href="cookies.html">Más información</a></p>
       <div class="consent-actions"><button class="btn btn-ghost btn-sm" data-c="no">Rechazar</button><button class="btn btn-primary btn-sm" data-c="yes">Aceptar analítica</button></div>`
    : `<p>Esta web solo utiliza almacenamiento técnico imprescindible. No usamos cookies de análisis ni de publicidad.</p>
       <div class="consent-actions"><button class="btn btn-primary btn-sm" data-c="no">Entendido</button></div>`;
  document.body.appendChild(box);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const analytics = b.dataset.c === 'yes';
    store.set('localStorage', CONSENT_KEY, JSON.stringify({ analytics, at: new Date().toISOString() }));
    box.remove();
    if (analytics) loadAnalytics(url);
    else if (document.querySelector('script[data-analytics]')) location.reload();
  });
}
function initConsent(settings) {
  const url = settings.analytics_snippet_url;
  if (!url) return; // sin herramientas opcionales, no hace falta pedir consentimiento
  const c = getConsent();
  if (!c) openConsentBanner(settings);
  else if (c.analytics) loadAnalytics(url);
}

// ---------------------------------------------------------------------
// Formularios: errores y estados de carga
// ---------------------------------------------------------------------
export function setFieldError(form, field, message) {
  const input = form.querySelector(`[name="${field}"]`);
  const holder = form.querySelector(`[data-error-for="${field}"]`);
  if (input) {
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (holder) input.setAttribute('aria-describedby', holder.id);
  }
  if (holder) holder.textContent = message ?? '';
  if (message && input) input.focus();
}
export function clearErrors(form) {
  $$('[data-error-for]', form).forEach((el) => (el.textContent = ''));
  $$('[aria-invalid="true"]', form).forEach((el) => el.setAttribute('aria-invalid', 'false'));
  const g = $('.form-error', form);
  if (g) g.textContent = '';
}
export function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(label ?? 'Enviando…')}`;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}
