// =====================================================================
// Panel de administración (JavaScript puro).
// · Inicio de sesión real con Supabase Auth (contraseña cifrada por Supabase).
// · Cada lectura/escritura va con la sesión del administrador y la base de datos
//   la valida con RLS (is_admin()): ocultar el enlace no es la protección.
// · Las acciones con efectos externos (correos, cambios de cita) pasan por la
//   Edge Function «admin», que vuelve a comprobar en el servidor que eres administrador.
// =====================================================================
import { $, $$, ANON_KEY, SUPABASE_URL, applyBrand, configured, esc, euros, icon, loadContent, store } from './assets/js/common.js';
import { BUDGETS, REQUEST_STATUSES, WEBSITE_TYPES, BUSINESS_TYPES, GOALS, CONTENT_STATUS, TIMELINES, labelOf } from './assets/js/wizard-data.js';
import { isValidTimeZone, parseHm, parseYmd, tzLabel, zonedParts, zonedToUtc } from './assets/js/time.js';
import { LAYOUT_NAMES, renderMock } from './assets/js/demos.js';

const view = $('#view');
const SESSION_KEY = 'wqv_admin_session';
let session = null;
let bookingCfg = null;

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function toast(msg, type = 'ok') {
  const t = $('.toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.className = 'toast'), type === 'error' ? 7000 : 3500);
}
const fmtDate = (d, tz = bookingCfg?.timezone ?? 'Atlantic/Canary') =>
  d ? new Intl.DateTimeFormat('es-ES', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '—';
const fmtDay = (d) => (d ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d)) : '—');
const parseEuros = (v) => {
  const s = String(v ?? '').trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
};
const centsInput = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
const STATUS_LABEL = Object.fromEntries(REQUEST_STATUSES.map((s) => [s.value, s.label]));
const BOOKING_LABEL = { confirmed: 'Pendiente', completed: 'Realizada', cancelled: 'Cancelada' };
const ORDER_LABEL = {
  awaiting_quote: 'Pendiente de presupuesto',
  pending_payment: 'Pendiente de pago',
  payment_setup_pending: 'Pago online no activado',
  deposit_paid: 'Señal pagada',
  paid: 'Pagado',
  payment_failed: 'Pago fallido',
  cancelled: 'Cancelado',
  in_progress: 'En desarrollo',
  delivered: 'Entregado',
};
const MAIL_LABEL = { sent: 'Correo enviado', failed: 'Error al enviar el correo', not_configured: 'Correo no configurado', pending: 'Correo pendiente' };
const badge = (value, label) => `<span class="badge ${esc(value)}">${esc(label ?? value)}</span>`;
const SOURCE_LABEL = { wizard: 'Formulario inicial', contact: 'Contacto', checkout: 'Contratación' };

function confirmDialog(message, { okLabel = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.innerHTML = `<p>${esc(message)}</p><div class="editor-actions" style="justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" value="no">Volver</button>
      <button class="btn ${danger ? 'btn-ghost btn-danger' : 'btn-primary'} btn-sm" value="yes">${esc(okLabel)}</button></div>`;
    document.body.appendChild(d);
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      d.close();
      d.remove();
      resolve(b.value === 'yes');
    });
    d.addEventListener('cancel', () => {
      d.remove();
      resolve(false);
    });
    d.showModal();
  });
}

// ---------------------------------------------------------------------
// Sesión (Supabase Auth por su API REST)
// ---------------------------------------------------------------------
function saveSession(s, remember) {
  session = { ...s, remember };
  store.del('localStorage', SESSION_KEY);
  store.del('sessionStorage', SESSION_KEY);
  store.set(remember ? 'localStorage' : 'sessionStorage', SESSION_KEY, JSON.stringify(session));
}
function loadSession() {
  try {
    return JSON.parse(store.get('sessionStorage', SESSION_KEY) ?? store.get('localStorage', SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}
async function auth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || 'No se pudo iniciar sesión.');
  return data;
}
async function refresh() {
  if (!session?.refresh_token) return false;
  try {
    const d = await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    saveSession({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, email: d.user?.email ?? session.email }, session.remember);
    return true;
  } catch {
    return false;
  }
}
async function token() {
  if (session && session.expires_at && session.expires_at * 1000 - Date.now() < 60000) {
    if (!(await refresh())) return logout('La sesión ha caducado. Vuelve a entrar.');
  }
  return session?.access_token;
}
async function logout(message) {
  const t = session?.access_token;
  session = null;
  store.del('localStorage', SESSION_KEY);
  store.del('sessionStorage', SESSION_KEY);
  if (t) fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
  showLogin(message);
  throw new Error('sesión cerrada');
}

// ---------------------------------------------------------------------
// Acceso a datos (siempre con la sesión del administrador → RLS)
// ---------------------------------------------------------------------
async function rest(path, { method = 'GET', body, prefer, count = false, range } = {}) {
  const t = await token();
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
  const p = [prefer, count ? 'count=exact' : null].filter(Boolean).join(',');
  if (p) headers.Prefer = p;
  if (range) headers.Range = range;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) {
    if (await refresh()) return rest(path, { method, body, prefer, count, range });
    return logout('La sesión ha caducado. Vuelve a entrar.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(friendlyError(data?.message ?? `Error ${res.status}`));
  if (count) {
    const total = Number((res.headers.get('content-range') ?? '').split('/')[1]);
    return { data, total: Number.isFinite(total) ? total : data.length };
  }
  return data;
}
function friendlyError(msg) {
  if (/payment_status_locked|solo los confirma Stripe/.test(msg)) return 'Los estados «Pagado» y «Señal pagada» solo los confirma Stripe o un cobro manual registrado.';
  if (/bookings_no_overlap|23P01/.test(msg)) return 'Esa hora se solapa con otra llamada.';
  if (/duplicate key|unique/.test(msg)) return 'Ya existe un registro con ese identificador.';
  if (/row-level security|permission denied|no_autorizado/.test(msg)) return 'Tu cuenta no tiene permisos para esta acción.';
  if (/violates check constraint/.test(msg)) return 'Algún valor no es válido. Revisa el formulario.';
  return msg;
}
async function adminFn(body) {
  const t = await token();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'No se pudo completar la acción. ¿Están desplegadas las Edge Functions?');
  return data;
}
const one = async (path) => (await rest(path))?.[0] ?? null;

// ---------------------------------------------------------------------
// Inicio de sesión
// ---------------------------------------------------------------------
function showLogin(message) {
  $('#shell').hidden = true;
  $('#login').hidden = false;
  const err = $('#login .form-error');
  err.textContent = message ?? '';
  $('#l-email').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const btn = f.querySelector('button[type=submit]');
  const err = f.querySelector('.form-error');
  err.textContent = '';
  if (!configured()) {
    err.textContent = 'Falta configurar Supabase en config.js.';
    return;
  }
  btn.disabled = true;
  try {
    const d = await auth('token?grant_type=password', { email: f.elements.email.value.trim(), password: f.elements.password.value });
    saveSession({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, email: d.user?.email }, f.elements.remember.checked);
    f.elements.password.value = '';
    await enter();
  } catch (ex) {
    if (ex.message !== 'sesión cerrada') err.textContent = /invalid/i.test(ex.message) ? 'Correo o contraseña incorrectos.' : ex.message;
  } finally {
    btn.disabled = false;
  }
});

async function enter() {
  // Comprobación en la base de datos: ¿esta cuenta es administradora?
  const isAdmin = await rest('rpc/is_admin', { method: 'POST', body: {} });
  if (isAdmin !== true) return logout('Esta cuenta no tiene permisos de administración.');
  $('#login').hidden = true;
  $('#shell').hidden = false;
  $('[data-user]').textContent = session.email ?? '';
  bookingCfg = await one('booking_settings?select=*&id=eq.1');
  route();
}
$('[data-logout]').addEventListener('click', () => logout().catch(() => {}));

// ---------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------
const ROUTES = {
  '': dashboard,
  solicitudes: requestsView,
  llamadas: callsView,
  disponibilidad: availabilityView,
  contrataciones: ordersView,
  paquetes: packagesView,
  contenido: contentView,
  ajustes: settingsView,
  integraciones: integrationsView,
};
async function route() {
  if (!session) return;
  const [, section = '', id] = location.hash.replace(/^#/, '').split('/');
  $$('.side-nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === `#/${section}` ? 'page' : 'false'));
  view.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  try {
    if (section === 'solicitudes' && id) await requestDetail(id);
    else await (ROUTES[section] ?? dashboard)();
    view.focus({ preventScroll: true });
  } catch (e) {
    if (e.message === 'sesión cerrada') return;
    view.innerHTML = `<div class="panel"><p class="form-error">${esc(e.message)}</p></div>`;
  }
}
window.addEventListener('hashchange', route);

// =====================================================================
// RESUMEN
// =====================================================================
async function dashboard() {
  const [s, calls, latest] = await Promise.all([
    rest('rpc/admin_dashboard', { method: 'POST', body: {} }),
    rest(`bookings?select=id,starts_at,name,email,project_summary,request_id&status=eq.confirmed&starts_at=gte.${encodeURIComponent(new Date().toISOString())}&order=starts_at.asc&limit=5`),
    rest('requests_overview?select=id,contact_name,business_name,website_type,status,created_at,source&order=created_at.desc&limit=6'),
  ]);
  const stat = (n, l, href) => `<a class="stat" href="${href}"><b>${n}</b><span>${esc(l)}</span></a>`;
  view.innerHTML = `
    <div class="view-head"><div><h1>Resumen</h1><p>${s.requests_last_7d} solicitudes en los últimos 7 días.</p></div></div>
    ${bookingCfg && !bookingCfg.enabled ? '<p class="notice" style="margin-bottom:18px"><strong>Las reservas online están desactivadas.</strong> Actívalas en <a href="#/disponibilidad">Disponibilidad</a> para que los visitantes puedan agendar llamadas.</p>' : ''}
    <div class="money">
      <div class="stat"><b>${euros(s.revenue_cents)}</b><span>Ingresos cobrados (${euros(s.revenue_stripe_cents)} por Stripe)</span></div>
      <div class="stat pending"><b>${euros(s.pending_cents)}</b><span>Pendiente de cobro en contrataciones activas</span></div>
    </div>
    <div class="stats">
      ${stat(s.requests_total, 'Solicitudes recibidas', '#/solicitudes')}
      ${stat(s.requests_new, 'Solicitudes nuevas', '#/solicitudes')}
      ${stat(s.quotes_sent, 'Presupuestos enviados', '#/solicitudes')}
      ${stat(s.accepted, 'Clientes aceptados', '#/solicitudes')}
      ${stat(s.in_development, 'Proyectos en desarrollo', '#/solicitudes')}
      ${stat(s.delivered, 'Proyectos entregados', '#/solicitudes')}
      ${stat(s.calls_pending, 'Llamadas pendientes', '#/llamadas')}
      ${stat(s.calls_done, 'Llamadas realizadas', '#/llamadas')}
      ${stat(s.orders_total, 'Contrataciones', '#/contrataciones')}
      ${stat(s.payments_confirmed, 'Pagos confirmados', '#/contrataciones')}
    </div>
    ${s.calls_to_review ? `<p class="notice" style="margin-bottom:18px">Hay ${s.calls_to_review} llamada(s) pasada(s) sin marcar como realizada o cancelada. <a href="#/llamadas">Revisarlas</a>.</p>` : ''}
    <div class="grid-2">
      <section class="panel"><h2>Próximas llamadas</h2>
        ${
          calls.length
            ? `<div class="table-wrap"><table class="t"><tbody>${calls
                .map((c) => `<tr><td class="nowrap">${fmtDate(c.starts_at)}</td><td>${esc(c.name)}<br><span class="muted small">${esc(c.email)}</span></td></tr>`)
                .join('')}</tbody></table></div>`
            : '<p class="muted">No hay llamadas próximas.</p>'
        }
      </section>
      <section class="panel"><h2>Últimas solicitudes</h2>
        ${
          latest.length
            ? `<div class="table-wrap"><table class="t"><tbody>${latest
                .map(
                  (r) => `<tr class="click" data-href="#/solicitudes/${r.id}"><td>${esc(r.contact_name)}<br><span class="muted small">${esc(r.business_name ?? SOURCE_LABEL[r.source] ?? '')}</span></td>
                    <td>${badge(r.status, STATUS_LABEL[r.status])}</td><td class="nowrap muted">${fmtDay(r.created_at)}</td></tr>`,
                )
                .join('')}</tbody></table></div>`
            : '<p class="muted">Todavía no hay solicitudes.</p>'
        }
      </section>
    </div>`;
}
view.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a,button,select,input')) location.hash = tr.dataset.href;
});

// =====================================================================
// SOLICITUDES
// =====================================================================
const reqFilters = { q: '', status: '', website_type: '', budget: '', source: '', from: '', to: '', page: 0 };
const PAGE = 50;

function requestsQuery(select, f) {
  const parts = [`select=${select}`, 'order=created_at.desc'];
  if (f.status) parts.push(`status=eq.${f.status}`);
  if (f.website_type) parts.push(`website_type=eq.${f.website_type}`);
  if (f.budget) parts.push(`budget=eq.${f.budget}`);
  if (f.source) parts.push(`source=eq.${f.source}`);
  if (f.from) parts.push(`created_at=gte.${encodeURIComponent(new Date(`${f.from}T00:00:00`).toISOString())}`);
  if (f.to) parts.push(`created_at=lt.${encodeURIComponent(new Date(new Date(`${f.to}T00:00:00`).getTime() + 86400000).toISOString())}`);
  const q = f.q.trim().replace(/[(),*%\\]/g, ' ').trim();
  if (q) {
    const v = encodeURIComponent(`*${q}*`);
    parts.push(`or=(contact_name.ilike.${v},contact_email.ilike.${v},business_name.ilike.${v})`);
  }
  return parts.join('&');
}

const opts = (list, selected, empty = 'Todos') =>
  `<option value="">${empty}</option>${list.map((o) => `<option value="${esc(o.value)}" ${o.value === selected ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}`;

async function requestsView() {
  const f = reqFilters;
  const { data, total } = await rest(
    `requests_overview?${requestsQuery('id,created_at,contact_name,contact_email,business_name,website_type,budget,status,source,bookings_count,orders_count', f)}`,
    { count: true, range: `${f.page * PAGE}-${f.page * PAGE + PAGE - 1}` },
  );
  view.innerHTML = `
    <div class="view-head"><div><h1>Solicitudes</h1><p>${total} resultado(s).</p></div>
      <button class="btn btn-ghost btn-sm" type="button" data-csv>Exportar a CSV</button></div>
    <form class="filters" data-filters>
      <div class="field wide"><label class="small" for="f-q">Buscar</label><input class="input" id="f-q" name="q" placeholder="Nombre, correo o empresa" value="${esc(f.q)}"></div>
      <div class="field"><label class="small" for="f-st">Estado</label><select class="input" id="f-st" name="status">${opts(REQUEST_STATUSES, f.status)}</select></div>
      <div class="field"><label class="small" for="f-wt">Tipo de web</label><select class="input" id="f-wt" name="website_type">${opts(WEBSITE_TYPES, f.website_type)}</select></div>
      <div class="field"><label class="small" for="f-bu">Presupuesto</label><select class="input" id="f-bu" name="budget">${opts(BUDGETS, f.budget)}</select></div>
      <div class="field"><label class="small" for="f-so">Origen</label><select class="input" id="f-so" name="source">${opts(Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })), f.source)}</select></div>
      <div class="field"><label class="small" for="f-fr">Desde</label><input class="input" id="f-fr" type="date" name="from" value="${esc(f.from)}"></div>
      <div class="field"><label class="small" for="f-to">Hasta</label><input class="input" id="f-to" type="date" name="to" value="${esc(f.to)}"></div>
      <button class="btn btn-primary btn-sm" type="submit">Filtrar</button>
      <button class="btn btn-ghost btn-sm" type="reset">Limpiar</button>
    </form>
    ${
      data.length
        ? `<div class="table-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Contacto</th><th>Negocio</th><th>Tipo de web</th><th>Presupuesto</th><th>Estado</th><th>Vínculos</th></tr></thead><tbody>
      ${data
        .map(
          (r) => `<tr class="click" data-href="#/solicitudes/${r.id}">
            <td class="nowrap">${fmtDay(r.created_at)}</td>
            <td><a href="#/solicitudes/${r.id}">${esc(r.contact_name)}</a><br><span class="muted small">${esc(r.contact_email)}</span></td>
            <td>${esc(r.business_name ?? '—')}<br><span class="muted small">${esc(SOURCE_LABEL[r.source] ?? r.source)}</span></td>
            <td>${esc(r.website_type ? labelOf(WEBSITE_TYPES, r.website_type) : '—')}</td>
            <td class="nowrap">${esc(r.budget ? labelOf(BUDGETS, r.budget) : '—')}</td>
            <td>${badge(r.status, STATUS_LABEL[r.status])}</td>
            <td class="nowrap muted small">${r.bookings_count} llamada(s)<br>${r.orders_count} contratación(es)</td></tr>`,
        )
        .join('')}</tbody></table></div>`
        : '<div class="panel empty">No hay solicitudes con estos filtros.</div>'
    }
    ${total > PAGE ? `<div class="pager"><button class="btn btn-ghost btn-xs" data-page="-1" ${f.page === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${f.page + 1} de ${Math.ceil(total / PAGE)}</span><button class="btn btn-ghost btn-xs" data-page="1" ${(f.page + 1) * PAGE >= total ? 'disabled' : ''}>Siguiente</button></div>` : ''}`;

  const form = $('[data-filters]', view);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    Object.assign(reqFilters, Object.fromEntries(new FormData(form)), { page: 0 });
    requestsView();
  });
  form.addEventListener('reset', () => {
    Object.assign(reqFilters, { q: '', status: '', website_type: '', budget: '', source: '', from: '', to: '', page: 0 });
    setTimeout(requestsView);
  });
  $$('[data-page]', view).forEach((b) =>
    b.addEventListener('click', () => {
      reqFilters.page += Number(b.dataset.page);
      requestsView();
    }),
  );
  $('[data-csv]', view).addEventListener('click', exportCsv);
}

async function exportCsv() {
  const rows = await rest(`requests_overview?${requestsQuery('*', reqFilters)}&limit=10000`);
  const cols = [
    ['created_at', 'Fecha', (r) => new Date(r.created_at).toISOString()],
    ['status', 'Estado', (r) => STATUS_LABEL[r.status] ?? r.status],
    ['source', 'Origen', (r) => SOURCE_LABEL[r.source] ?? r.source],
    ['contact_name', 'Nombre'],
    ['contact_email', 'Correo'],
    ['contact_phone', 'Teléfono'],
    ['business_name', 'Negocio'],
    ['business_type', 'Tipo de negocio', (r) => (r.business_type ? labelOf(BUSINESS_TYPES, r.business_type) : '')],
    ['website_type', 'Tipo de web', (r) => (r.website_type ? labelOf(WEBSITE_TYPES, r.website_type) : '')],
    ['goal', 'Objetivo', (r) => (r.goal ? labelOf(GOALS, r.goal) : '')],
    ['budget', 'Presupuesto', (r) => (r.budget ? labelOf(BUDGETS, r.budget) : '')],
    ['content_status', 'Contenido', (r) => (r.content_status ? labelOf(CONTENT_STATUS, r.content_status) : '')],
    ['timeline', 'Plazo', (r) => (r.timeline ? labelOf(TIMELINES, r.timeline) : '')],
    ['message', 'Mensaje'],
    ['marketing_consent', 'Acepta comunicaciones', (r) => (r.marketing_consent ? 'Sí' : 'No')],
    ['bookings_count', 'Llamadas'],
    ['orders_count', 'Contrataciones'],
  ];
  // Evita la inyección de fórmulas al abrir el CSV en Excel.
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [cols.map((c) => cell(c[1])).join(';'), ...rows.map((r) => cols.map(([k, , fn]) => cell(fn ? fn(r) : r[k])).join(';'))].join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `solicitudes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${rows.length} solicitud(es) exportada(s).`);
}

async function requestDetail(id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Solicitud no válida.');
  const r = await one(`requests_overview?select=*&id=eq.${id}`);
  if (!r) throw new Error('Esta solicitud no existe o se ha eliminado.');
  const [answers, notes, bookings, orders] = await Promise.all([
    rest(`request_answers?select=*&request_id=eq.${id}&order=step`),
    rest(`private_notes?select=*&or=(request_id.eq.${id},contact_id.eq.${r.contact_id})&order=created_at.desc`),
    rest(`bookings?select=id,starts_at,status,project_summary&or=(request_id.eq.${id},contact_id.eq.${r.contact_id})&order=starts_at.desc`),
    rest(`orders?select=id,created_at,status,total_cents,package_snapshot,requirements&or=(request_id.eq.${id},contact_id.eq.${r.contact_id})&order=created_at.desc`),
  ]);
  const wa = r.contact_phone ? `https://wa.me/${r.contact_phone.replace(/[^\d]/g, '')}` : null;
  view.innerHTML = `
    <a class="back-link" href="#/solicitudes">${icon('back', 16)}Solicitudes</a>
    <div class="view-head"><div><h1>${esc(r.contact_name)}</h1><p>${esc(r.business_name ?? 'Sin nombre de negocio')}, recibida el ${fmtDate(r.created_at)} (${esc(SOURCE_LABEL[r.source] ?? r.source)})</p></div>
      <div class="row-actions">
        <a class="btn btn-ghost btn-sm" href="mailto:${esc(r.contact_email)}">${icon('mail', 16)}<span>Escribir</span></a>
        ${wa ? `<a class="btn btn-ghost btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat', 16)}<span>WhatsApp</span></a>` : ''}
      </div></div>
    <div class="grid-2">
      <div>
        <section class="panel"><h2>Estado</h2>
          <form class="row-actions" data-status>
            <select class="input sm" name="status" aria-label="Estado">${REQUEST_STATUSES.map((s) => `<option value="${s.value}" ${s.value === r.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
            <button class="btn btn-primary btn-xs" type="submit">Guardar estado</button>
          </form>
        </section>
        <section class="panel"><h2>Contacto</h2>
          <dl class="kv"><dt>Correo</dt><dd>${esc(r.contact_email)}</dd><dt>Teléfono</dt><dd>${esc(r.contact_phone ?? '—')}</dd>
          <dt>Comunicaciones comerciales</dt><dd>${r.marketing_consent ? 'Acepta' : 'No acepta'}</dd>
          <dt>Privacidad aceptada</dt><dd>${fmtDate(r.privacy_accepted_at)}</dd></dl>
        </section>
        <section class="panel"><h2>Respuestas</h2>
          ${
            answers.length
              ? `<dl class="kv">${answers.map((a) => `<dt>${esc(a.question_label)}</dt><dd>${esc(a.answer_label ?? a.answer_value ?? '—')}</dd>`).join('')}</dl>`
              : r.message
                ? `<p style="white-space:pre-wrap">${esc(r.message)}</p>`
                : '<p class="muted">Sin respuestas.</p>'
          }
        </section>
      </div>
      <div>
        <section class="panel"><h2>Notas privadas</h2>
          <p class="muted small">Solo las ves tú. Nunca se muestran al cliente.</p>
          <div class="notes">${
            notes.length
              ? notes
                  .map((n) => `<div class="note">${esc(n.body)}<small><span>${fmtDate(n.created_at)}</span><button class="btn-link" data-del-note="${n.id}">Eliminar</button></small></div>`)
                  .join('')
              : '<p class="muted">Todavía no hay notas.</p>'
          }</div>
          <form class="form" data-note><label class="sr-only" for="note-body">Nueva nota</label>
            <textarea class="input" id="note-body" name="body" rows="3" maxlength="5000" required placeholder="Escribe una nota interna…"></textarea>
            <div><button class="btn btn-primary btn-xs" type="submit">Añadir nota</button></div></form>
        </section>
        <section class="panel"><h2>Llamadas</h2>
          ${bookings.length ? bookings.map((b) => `<p>${badge(b.status, BOOKING_LABEL[b.status])} ${fmtDate(b.starts_at)} ${b.project_summary ? `<br><span class="muted small">${esc(b.project_summary)}</span>` : ''}</p>`).join('') : '<p class="muted">Sin llamadas.</p>'}
          <a class="btn-link small" href="#/llamadas">Ir a llamadas</a>
        </section>
        <section class="panel"><h2>Contrataciones</h2>
          ${orders.length ? orders.map((o) => `<p>${badge(o.status, ORDER_LABEL[o.status])} ${esc(o.package_snapshot?.name ?? '')}, ${euros(o.total_cents)} <span class="muted small">(${fmtDay(o.created_at)})</span>${o.requirements ? `<br><span class="muted small">${esc(o.requirements)}</span>` : ''}</p>`).join('') : '<p class="muted">Sin contrataciones.</p>'}
          <a class="btn-link small" href="#/contrataciones">Ir a contrataciones</a>
        </section>
        <section class="panel"><h2>Eliminar</h2>
          <p class="muted small">Elimina la solicitud y sus respuestas y notas. El contacto, sus llamadas y sus contrataciones se conservan.</p>
          <button class="btn btn-ghost btn-danger btn-xs" type="button" data-delete>Eliminar solicitud</button>
        </section>
      </div>
    </div>`;

  $('[data-status]', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    await rest(`requests?id=eq.${id}`, { method: 'PATCH', body: { status: e.currentTarget.elements.status.value } });
    toast('Estado actualizado.');
  });
  $('[data-note]', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = e.currentTarget.elements.body.value.trim();
    if (!body) return;
    await rest('private_notes', { method: 'POST', body: { request_id: id, contact_id: r.contact_id, body } });
    toast('Nota añadida.');
    requestDetail(id);
  });
  view.querySelectorAll('[data-del-note]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog('¿Eliminar esta nota?', { okLabel: 'Eliminar', danger: true }))) return;
      await rest(`private_notes?id=eq.${b.dataset.delNote}`, { method: 'DELETE' });
      requestDetail(id);
    }),
  );
  $('[data-delete]', view).addEventListener('click', async () => {
    if (!(await confirmDialog('¿Eliminar esta solicitud definitivamente? No se puede deshacer.', { okLabel: 'Eliminar', danger: true }))) return;
    await rest(`requests?id=eq.${id}`, { method: 'DELETE' });
    toast('Solicitud eliminada.');
    location.hash = '#/solicitudes';
  });
}

// =====================================================================
// LLAMADAS
// =====================================================================
let callsFilter = { when: 'upcoming', status: '' };
async function callsView() {
  const now = encodeURIComponent(new Date().toISOString());
  const parts = ['select=*', 'limit=300'];
  if (callsFilter.when === 'upcoming') parts.push(`starts_at=gte.${now}`, 'order=starts_at.asc');
  else if (callsFilter.when === 'past') parts.push(`starts_at=lt.${now}`, 'order=starts_at.desc');
  else parts.push('order=starts_at.desc');
  if (callsFilter.status) parts.push(`status=eq.${callsFilter.status}`);
  const rows = await rest(`bookings?${parts.join('&')}`);
  const tz = bookingCfg?.timezone ?? 'Atlantic/Canary';
  view.innerHTML = `
    <div class="view-head"><div><h1>Llamadas agendadas</h1><p>Horas en ${esc(tzLabel(tz))}. Para cambiar horarios, duración o bloquear días, ve a <a href="#/disponibilidad">Disponibilidad</a>.</p></div></div>
    <form class="filters" data-cf>
      <div class="field"><label class="small" for="cf-when">Mostrar</label><select class="input" id="cf-when" name="when">
        <option value="upcoming" ${callsFilter.when === 'upcoming' ? 'selected' : ''}>Próximas</option>
        <option value="past" ${callsFilter.when === 'past' ? 'selected' : ''}>Pasadas</option>
        <option value="all" ${callsFilter.when === 'all' ? 'selected' : ''}>Todas</option></select></div>
      <div class="field"><label class="small" for="cf-st">Estado</label><select class="input" id="cf-st" name="status">
        ${opts(Object.entries(BOOKING_LABEL).map(([value, label]) => ({ value, label })), callsFilter.status)}</select></div>
    </form>
    ${
      rows.length
        ? `<div class="table-wrap"><table class="t"><thead><tr><th>Fecha y hora</th><th>Cliente</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      ${rows
        .map(
          (b) => `<tr>
          <td class="nowrap">${fmtDate(b.starts_at, tz)}<br><span class="muted small">${b.visitor_timezone && b.visitor_timezone !== tz ? `Cliente en ${esc(b.visitor_timezone)}` : ''}</span></td>
          <td>${esc(b.name)}<br><a class="muted small" href="mailto:${esc(b.email)}">${esc(b.email)}</a>${b.phone ? `<br><a class="muted small" href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ''}
            ${b.request_id ? `<br><a class="small" href="#/solicitudes/${b.request_id}">Ver solicitud</a>` : '<br><span class="muted small">Sin formulario previo</span>'}</td>
          <td style="max-width:280px">${esc(b.project_summary ?? '—')}${b.cancel_reason ? `<br><span class="muted small">Motivo de cancelación: ${esc(b.cancel_reason)}</span>` : ''}</td>
          <td>${badge(b.status, BOOKING_LABEL[b.status])}<br><span class="muted small">${esc(MAIL_LABEL[b.email_status] ?? '')}</span></td>
          <td><div class="row-actions">
            ${b.status !== 'completed' && b.status !== 'cancelled' ? `<button class="btn btn-ghost btn-xs" data-done="${b.id}">Marcar realizada</button>` : ''}
            ${b.status === 'completed' ? `<button class="btn btn-ghost btn-xs" data-pending="${b.id}">Marcar pendiente</button>` : ''}
            ${b.status === 'confirmed' ? `<button class="btn btn-ghost btn-xs" data-move="${b.id}">Cambiar hora</button><button class="btn btn-ghost btn-danger btn-xs" data-cancel="${b.id}">Cancelar</button>` : ''}
          </div></td></tr>`,
        )
        .join('')}</tbody></table></div>`
        : '<div class="panel empty">No hay llamadas con este filtro.</div>'
    }`;
  $('[data-cf]', view).addEventListener('change', (e) => {
    callsFilter = Object.fromEntries(new FormData(e.currentTarget));
    callsView();
  });
  const setStatus = async (id, status) => {
    await rest(`bookings?id=eq.${id}&status=neq.cancelled`, { method: 'PATCH', body: { status } });
    toast(status === 'completed' ? 'Marcada como realizada.' : 'Marcada como pendiente.');
    callsView();
  };
  $$('[data-done]', view).forEach((b) => b.addEventListener('click', () => setStatus(b.dataset.done, 'completed')));
  $$('[data-pending]', view).forEach((b) => b.addEventListener('click', () => setStatus(b.dataset.pending, 'confirmed')));
  $$('[data-cancel]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog('¿Cancelar esta llamada? Se avisará al cliente por correo si el envío está configurado.', { okLabel: 'Cancelar llamada', danger: true }))) return;
      try {
        const r = await adminFn({ action: 'cancel', id: b.dataset.cancel });
        toast(`Llamada cancelada. ${MAIL_LABEL[r.emailStatus] ?? ''}.`);
      } catch (e) {
        toast(e.message, 'error');
      }
      callsView();
    }),
  );
  $$('[data-move]', view).forEach((b) => b.addEventListener('click', () => moveDialog(rows.find((x) => x.id === b.dataset.move), tz)));
}

function moveDialog(b, tz) {
  const p = zonedParts(new Date(b.starts_at), tz);
  const pad = (n) => String(n).padStart(2, '0');
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.innerHTML = `<form class="form" method="dialog">
      <h2 style="font-size:1.15rem">Cambiar la hora de ${esc(b.name)}</h2>
      <p class="muted small" style="margin:0">Hora de ${esc(tzLabel(tz))}. Como administrador puedes elegir cualquier hora; no puede solaparse con otra llamada.</p>
      <div class="row-2"><div class="field"><label for="mv-d">Día</label><input class="input" id="mv-d" type="date" name="date" required value="${p.y}-${pad(p.m)}-${pad(p.d)}"></div>
      <div class="field"><label for="mv-t">Hora</label><input class="input" id="mv-t" type="time" name="time" required value="${pad(p.h)}:${pad(p.min)}"></div></div>
      <p class="form-error" role="alert"></p>
      <div class="editor-actions" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" value="cancel" formnovalidate>Volver</button><button class="btn btn-primary btn-sm" value="ok">Guardar y avisar al cliente</button></div>
    </form>`;
  document.body.appendChild(d);
  const f = $('form', d);
  f.addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'ok') return d.remove();
    e.preventDefault();
    try {
      const r = await adminFn({ action: 'reschedule', id: b.id, date: f.elements.date.value, time: f.elements.time.value });
      d.close();
      d.remove();
      toast(`Hora cambiada. ${MAIL_LABEL[r.emailStatus] ?? ''}.`);
      callsView();
    } catch (ex) {
      $('.form-error', f).textContent = ex.message;
    }
  });
  d.showModal();
}

// =====================================================================
// DISPONIBILIDAD
// =====================================================================
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
async function availabilityView() {
  const [cfg, blocks, site] = await Promise.all([
    one('booking_settings?select=*&id=eq.1'),
    rest(`availability_blocks?select=*&ends_at=gte.${encodeURIComponent(new Date().toISOString())}&order=starts_at`),
    one('site_settings?select=booking_provider,calendly_url&id=eq.1'),
  ]);
  bookingCfg = cfg;
  const tz = cfg.timezone;
  const zones = (Intl.supportedValuesOf?.('timeZone') ?? ['Atlantic/Canary', 'Europe/Madrid', 'Europe/Lisbon', 'Europe/London', 'America/Mexico_City']).filter(Boolean);
  const wk = cfg.weekly_hours ?? {};
  view.innerHTML = `
    <div class="view-head"><div><h1>Disponibilidad</h1><p>Solo se ofrecen las horas que cumplen todo lo de aquí. Los cambios se aplican al momento.</p></div></div>
    <form class="panel editor" data-cfg>
      <h2>Reservas de llamadas</h2>
      <label class="check"><input type="checkbox" name="enabled" ${cfg.enabled ? 'checked' : ''}><span><strong style="color:var(--text)">Reservas online activas</strong>. Si lo desactivas, la página de reservas ofrece otras vías de contacto.</span></label>
      <div class="grid-3">
        <div class="field"><label for="a-tz">Zona horaria</label><select class="input" id="a-tz" name="timezone">${zones.map((z) => `<option ${z === tz ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></div>
        <div class="field"><label for="a-dur">Duración de la llamada (min)</label><input class="input" id="a-dur" name="duration_min" type="number" min="5" max="240" value="${cfg.duration_min}"></div>
        <div class="field"><label for="a-buf">Descanso entre llamadas (min)</label><input class="input" id="a-buf" name="buffer_min" type="number" min="0" max="120" value="${cfg.buffer_min}"></div>
        <div class="field"><label for="a-min">Antelación mínima (horas)</label><input class="input" id="a-min" name="min_notice_hours" type="number" min="0" max="336" value="${Math.round(cfg.min_notice_min / 60)}"></div>
        <div class="field"><label for="a-max">Antelación máxima (días)</label><input class="input" id="a-max" name="max_advance_days" type="number" min="1" max="365" value="${cfg.max_advance_days}"></div>
      </div>
      <div class="field"><label for="a-det">Cómo será la llamada (aparece en la confirmación)</label><textarea class="input" id="a-det" name="meeting_details" rows="2" maxlength="500">${esc(cfg.meeting_details)}</textarea></div>
      <h3>Días y horarios de trabajo</h3>
      <div class="week">${DAYS.map((name, i) => {
        const d = String(i + 1);
        const ranges = wk[d] ?? [];
        return `<div class="week-day"><label class="check"><input type="checkbox" name="d${d}_on" ${ranges.length ? 'checked' : ''}><span style="color:var(--text)">${name}</span></label>
          <div class="ranges">${[0, 1, 2]
            .map((k) => `<span class="range"><input class="input" type="time" name="d${d}_s${k}" value="${esc(ranges[k]?.start ?? '')}" aria-label="${name}, tramo ${k + 1}, inicio"> a <input class="input" type="time" name="d${d}_e${k}" value="${esc(ranges[k]?.end ?? '')}" aria-label="${name}, tramo ${k + 1}, fin"></span>`)
            .join('')}</div></div>`;
      }).join('')}</div>
      <p class="help">Hasta tres tramos por día (por ejemplo, mañana y tarde). Deja vacíos los que no uses.</p>
      <div class="editor-actions"><button class="btn btn-primary btn-sm" type="submit">Guardar disponibilidad</button></div>
    </form>

    <section class="panel">
      <h2>Vacaciones, festivos y bloqueos</h2>
      <form class="editor" data-block>
        <div class="grid-3">
          <div class="field"><label for="b-kind">Tipo</label><select class="input" id="b-kind" name="kind"><option value="vacation">Vacaciones (varios días)</option><option value="holiday">Festivo (día completo)</option><option value="block">Bloqueo de horas</option></select></div>
          <div class="field"><label for="b-from">Desde el día</label><input class="input" id="b-from" type="date" name="from" required></div>
          <div class="field" data-to><label for="b-to">Hasta el día (incluido)</label><input class="input" id="b-to" type="date" name="to"></div>
          <div class="field" data-hours hidden><label for="b-st">De</label><input class="input" id="b-st" type="time" name="start_time"></div>
          <div class="field" data-hours hidden><label for="b-et">A</label><input class="input" id="b-et" type="time" name="end_time"></div>
          <div class="field"><label for="b-reason">Motivo (interno)</label><input class="input" id="b-reason" name="reason" maxlength="200"></div>
        </div>
        <div class="editor-actions"><button class="btn btn-primary btn-sm" type="submit">Añadir bloqueo</button></div>
      </form>
      <h3>Próximos bloqueos</h3>
      ${
        blocks.length
          ? `<div class="table-wrap"><table class="t"><tbody>${blocks
              .map((b) => `<tr><td>${esc({ holiday: 'Festivo', vacation: 'Vacaciones', block: 'Bloqueo' }[b.kind])}</td><td class="nowrap">${fmtDate(b.starts_at, tz)} a ${fmtDate(b.ends_at, tz)}</td><td>${esc(b.reason ?? '')}</td><td><button class="btn btn-ghost btn-danger btn-xs" data-del-block="${b.id}">Quitar</button></td></tr>`)
              .join('')}</tbody></table></div>`
          : '<p class="muted">No hay bloqueos próximos.</p>'
      }
    </section>

    <form class="panel editor" data-provider>
      <h2>Sistema de reservas</h2>
      <div class="radio-cards">
        <label class="radio-card"><input type="radio" name="booking_provider" value="own" ${site.booking_provider !== 'calendly' ? 'checked' : ''}><span>Calendario propio<small>Usa los horarios de esta página, guarda las reservas aquí y envía las confirmaciones.</small></span><span></span></label>
        <label class="radio-card"><input type="radio" name="booking_provider" value="calendly" ${site.booking_provider === 'calendly' ? 'checked' : ''}><span>Calendly<small>Inserta tu calendario de Calendly. Las reservas se gestionan en Calendly, no en este panel.</small></span><span></span></label>
      </div>
      <div class="field"><label for="p-cal">Enlace de Calendly</label><input class="input" id="p-cal" name="calendly_url" placeholder="https://calendly.com/tu-usuario/15min" value="${esc(site.calendly_url ?? '')}"></div>
      <div class="editor-actions"><button class="btn btn-primary btn-sm" type="submit">Guardar</button></div>
    </form>`;

  $('[data-cfg]', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const g = (n) => f.elements[n].value;
    const weekly = {};
    for (let d = 1; d <= 7; d++) {
      if (!f.elements[`d${d}_on`].checked) continue;
      const ranges = [];
      for (let k = 0; k < 3; k++) {
        const s = g(`d${d}_s${k}`);
        const en = g(`d${d}_e${k}`);
        if (!s && !en) continue;
        if (!parseHm(s) || !parseHm(en) || s >= en) return toast(`${DAYS[d - 1]}: cada tramo necesita una hora de inicio anterior a la de fin.`, 'error');
        ranges.push({ start: s, end: en });
      }
      if (ranges.length) weekly[String(d)] = ranges;
    }
    if (!isValidTimeZone(g('timezone'))) return toast('Zona horaria no válida.', 'error');
    const num = (n, min, max) => Math.min(max, Math.max(min, Math.round(Number(g(n)) || 0)));
    await rest('booking_settings?id=eq.1', {
      method: 'PATCH',
      body: {
        enabled: f.elements.enabled.checked,
        timezone: g('timezone'),
        duration_min: num('duration_min', 5, 240),
        buffer_min: num('buffer_min', 0, 120),
        min_notice_min: num('min_notice_hours', 0, 336) * 60,
        max_advance_days: num('max_advance_days', 1, 365),
        weekly_hours: weekly,
        meeting_details: g('meeting_details').trim() || 'Te llamaremos al teléfono que indiques.',
      },
    });
    toast('Disponibilidad guardada.');
    availabilityView();
  });

  const bf = $('[data-block]', view);
  const syncKind = () => {
    const k = bf.elements.kind.value;
    $$('[data-hours]', bf).forEach((el) => (el.hidden = k !== 'block'));
    $('[data-to]', bf).hidden = k === 'block' || k === 'holiday';
  };
  bf.elements.kind.addEventListener('change', syncKind);
  syncKind();
  bf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const k = bf.elements.kind.value;
    const from = parseYmd(bf.elements.from.value);
    const to = k === 'vacation' ? parseYmd(bf.elements.to.value) ?? from : from;
    if (!from || !to) return toast('Indica las fechas.', 'error');
    let starts;
    let ends;
    if (k === 'block') {
      const s = parseHm(bf.elements.start_time.value);
      const en = parseHm(bf.elements.end_time.value);
      if (!s || !en) return toast('Indica la hora de inicio y de fin.', 'error');
      starts = zonedToUtc(from.y, from.m, from.d, s.h, s.min, tz);
      ends = zonedToUtc(from.y, from.m, from.d, en.h, en.min, tz);
    } else {
      starts = zonedToUtc(from.y, from.m, from.d, 0, 0, tz);
      const n = new Date(Date.UTC(to.y, to.m - 1, to.d + 1));
      ends = zonedToUtc(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), 0, 0, tz);
    }
    if (!starts || !ends || ends <= starts) return toast('El final debe ser posterior al inicio.', 'error');
    await rest('availability_blocks', { method: 'POST', body: { kind: k, starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: bf.elements.reason.value.trim() || null } });
    toast('Bloqueo añadido. Esas horas ya no se ofrecen.');
    availabilityView();
  });
  $$('[data-del-block]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      await rest(`availability_blocks?id=eq.${b.dataset.delBlock}`, { method: 'DELETE' });
      toast('Bloqueo eliminado.');
      availabilityView();
    }),
  );
  $('[data-provider]', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const provider = f.elements.booking_provider.value;
    const url = f.elements.calendly_url.value.trim();
    if (url && !/^https:\/\/(www\.)?calendly\.com\/[A-Za-z0-9_\-/]+$/.test(url)) return toast('El enlace debe ser del tipo https://calendly.com/usuario/evento', 'error');
    if (provider === 'calendly' && !url) return toast('Para usar Calendly, indica el enlace.', 'error');
    await rest('site_settings?id=eq.1', { method: 'PATCH', body: { booking_provider: provider, calendly_url: url || null } });
    toast('Sistema de reservas guardado.');
  });
}

// =====================================================================
// CONTRATACIONES
// =====================================================================
async function ordersView() {
  const [orders, payments] = await Promise.all([
    rest('orders?select=*,contacts(name,email,phone)&order=created_at.desc&limit=300'),
    rest('payments?select=order_id,amount_cents,status,provider,paid_at&order=created_at'),
  ]);
  const paidBy = {};
  for (const p of payments) if (p.status === 'paid') paidBy[p.order_id] = (paidBy[p.order_id] ?? 0) + p.amount_cents;
  const editable = ['awaiting_quote', 'pending_payment', 'payment_setup_pending', 'payment_failed', 'cancelled', 'in_progress', 'delivered'];
  view.innerHTML = `
    <div class="view-head"><div><h1>Contrataciones</h1><p>Los estados de pago solo cambian cuando Stripe confirma el cobro o registras un cobro manual.</p></div></div>
    ${
      orders.length
        ? `<div class="table-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Cliente</th><th>Plan</th><th class="num">Total</th><th class="num">Cobrado</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      ${orders
        .map((o) => {
          const paid = paidBy[o.id] ?? 0;
          return `<tr>
            <td class="nowrap">${fmtDay(o.created_at)}</td>
            <td>${esc(o.contacts?.name ?? '')}<br><a class="muted small" href="mailto:${esc(o.contacts?.email ?? '')}">${esc(o.contacts?.email ?? '')}</a>${o.request_id ? `<br><a class="small" href="#/solicitudes/${o.request_id}">Ver solicitud</a>` : ''}</td>
            <td>${esc(o.package_snapshot?.name ?? '')}${o.maintenance_snapshot ? `<br><span class="muted small">+ ${esc(o.maintenance_snapshot.name)}</span>` : ''}${o.requirements ? `<br><span class="muted small">${esc(o.requirements)}</span>` : ''}</td>
            <td class="num">${euros(o.total_cents)}</td>
            <td class="num">${euros(paid)}</td>
            <td>${badge(o.status, ORDER_LABEL[o.status])}</td>
            <td><div class="row-actions">
              <select class="input sm" data-order-status="${o.id}" aria-label="Cambiar estado">${(editable.includes(o.status) ? editable : [o.status, ...editable])
                .map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''} ${['paid', 'deposit_paid'].includes(s) ? 'disabled' : ''}>${ORDER_LABEL[s]}</option>`)
                .join('')}</select>
              ${paid < o.total_cents && o.status !== 'cancelled' ? `<button class="btn btn-ghost btn-xs" data-manual="${o.id}" data-left="${o.total_cents - paid}">Registrar cobro manual</button>` : ''}
            </div></td></tr>`;
        })
        .join('')}</tbody></table></div>`
        : '<div class="panel empty">Todavía no hay contrataciones.</div>'
    }`;
  $$('[data-order-status]', view).forEach((sel) =>
    sel.addEventListener('change', async () => {
      try {
        await rest(`orders?id=eq.${sel.dataset.orderStatus}`, { method: 'PATCH', body: { status: sel.value } });
        toast('Estado actualizado.');
      } catch (e) {
        toast(e.message, 'error');
      }
      ordersView();
    }),
  );
  $$('[data-manual]', view).forEach((b) =>
    b.addEventListener('click', () => {
      const d = document.createElement('dialog');
      d.className = 'modal';
      d.innerHTML = `<form class="form">
        <h2 style="font-size:1.15rem">Registrar un cobro fuera de Stripe</h2>
        <p class="muted small" style="margin:0">Transferencia, Bizum, efectivo… Queda registrado como cobro manual. Pendiente: ${euros(Number(b.dataset.left))}.</p>
        <div class="field"><label for="mp-a">Importe recibido (€)</label><input class="input" id="mp-a" name="amount" inputmode="decimal" required value="${centsInput(Number(b.dataset.left))}"></div>
        <div class="field"><label for="mp-n">Nota (opcional)</label><input class="input" id="mp-n" name="note" maxlength="200" placeholder="Transferencia del 12/10"></div>
        <label class="check"><input type="checkbox" name="confirm" required><span>Confirmo que he recibido este dinero.</span></label>
        <p class="form-error" role="alert"></p>
        <div class="editor-actions" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" type="button" data-x>Volver</button><button class="btn btn-primary btn-sm" type="submit">Registrar cobro</button></div></form>`;
      document.body.appendChild(d);
      const f = $('form', d);
      $('[data-x]', d).addEventListener('click', () => d.remove());
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cents = parseEuros(f.elements.amount.value);
        if (!cents || cents <= 0) return ($('.form-error', f).textContent = 'Importe no válido.');
        if (!f.elements.confirm.checked) return ($('.form-error', f).textContent = 'Confirma que has recibido el cobro.');
        try {
          await rest('rpc/admin_add_manual_payment', { method: 'POST', body: { p_order: b.dataset.manual, p_amount_cents: cents, p_note: f.elements.note.value.trim() || null } });
          d.remove();
          toast('Cobro registrado.');
          ordersView();
        } catch (ex) {
          $('.form-error', f).textContent = ex.message;
        }
      });
      d.showModal();
    }),
  );
}

// =====================================================================
// EDITOR GENÉRICO (paquetes, mantenimiento, servicios adicionales, FAQ, galería)
// =====================================================================
/**
 * Tipos de campo: text, textarea, number, money, bool, lines (lista de líneas), select, color3 (paleta), image
 */
function fieldHtml(f, row, uid) {
  const v = row?.[f.name];
  const id = `${uid}-${f.name}`;
  const req = f.required ? '<span class="req" aria-hidden="true">*</span>' : '';
  const help = f.help ? `<p class="help">${esc(f.help)}</p>` : '';
  switch (f.type) {
    case 'bool':
      return `<label class="check"><input type="checkbox" name="${f.name}" ${v ?? f.default ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
    case 'textarea':
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><textarea class="input" id="${id}" name="${f.name}" rows="${f.rows ?? 3}" maxlength="${f.max ?? 2000}">${esc(v ?? '')}</textarea>${help}</div>`;
    case 'lines':
      return `<div class="field"><label for="${id}">${esc(f.label)}</label><textarea class="input" id="${id}" name="${f.name}" rows="${f.rows ?? 6}">${esc((Array.isArray(v) ? v : []).join('\n'))}</textarea><p class="help">Una por línea.</p></div>`;
    case 'money':
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><input class="input" id="${id}" name="${f.name}" inputmode="decimal" value="${esc(centsInput(v))}" placeholder="249,99">${help}</div>`;
    case 'number':
      return `<div class="field"><label for="${id}">${esc(f.label)}</label><input class="input" id="${id}" name="${f.name}" type="number" min="${f.min ?? 0}" max="${f.maxv ?? 100000}" value="${esc(v ?? f.default ?? '')}">${help}</div>`;
    case 'select':
      return `<div class="field"><label for="${id}">${esc(f.label)}</label><select class="input" id="${id}" name="${f.name}">${f.options.map(([val, lab]) => `<option value="${esc(val)}" ${val === (v ?? f.default) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>${help}</div>`;
    case 'color3': {
      const pal = v ?? { bg: '#16181c', fg: '#eeeeee', accent: '#d8b46a' };
      return `<div class="field"><span class="label">${esc(f.label)}</span><div class="color-row">
        ${['bg', 'fg', 'accent'].map((k) => `<label class="small muted" style="display:flex;gap:6px;align-items:center"><input type="color" name="${f.name}_${k}" value="${esc(pal[k])}">${{ bg: 'Fondo', fg: 'Texto', accent: 'Acento' }[k]}</label>`).join('')}</div></div>`;
    }
    case 'image':
      return `<div class="field"><label for="${id}">${esc(f.label)}</label>${v ? `<p class="small muted" style="margin:0">Imagen actual: <a href="${esc(v)}" target="_blank" rel="noopener">ver</a> <label class="check" style="display:inline-flex;gap:6px"><input type="checkbox" name="${f.name}_remove"><span>Quitar</span></label></p>` : ''}
        <input class="input" id="${id}" name="${f.name}" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"><p class="help">PNG, JPG, WEBP o SVG. Máximo 2 MB.</p></div>`;
    default:
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><input class="input" id="${id}" name="${f.name}" maxlength="${f.max ?? 200}" value="${esc(v ?? '')}" ${f.pattern ? `pattern="${f.pattern}"` : ''}>${help}</div>`;
  }
}

async function uploadImage(file, folder) {
  const okTypes = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
  if (!okTypes[file.type]) throw new Error('Formato no permitido (PNG, JPG, WEBP o SVG).');
  if (file.size > 2 * 1024 * 1024) throw new Error('La imagen supera 2 MB.');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${okTypes[file.type]}`;
  const t = await token();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public-assets/${path}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${t}`, 'Content-Type': file.type, 'x-upsert': 'false' },
    body: file,
  });
  if (!res.ok) throw new Error('No se pudo subir la imagen. ¿Has ejecutado las migraciones de almacenamiento?');
  return `${SUPABASE_URL}/storage/v1/object/public/public-assets/${path}`;
}

async function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.name];
    switch (f.type) {
      case 'bool':
        out[f.name] = el.checked;
        break;
      case 'lines':
        out[f.name] = el.value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 40);
        break;
      case 'money': {
        const c = parseEuros(el.value);
        if (c == null) throw new Error(`${f.label}: escribe un importe como 249,99.`);
        out[f.name] = c;
        break;
      }
      case 'number':
        out[f.name] = el.value === '' ? (f.nullable ? null : f.default ?? 0) : Math.round(Number(el.value));
        break;
      case 'color3':
        out[f.name] = { bg: form.elements[`${f.name}_bg`].value, fg: form.elements[`${f.name}_fg`].value, accent: form.elements[`${f.name}_accent`].value };
        break;
      case 'image': {
        const file = el.files?.[0];
        if (file) out[f.name] = await uploadImage(file, f.folder ?? 'imagenes');
        else if (form.elements[`${f.name}_remove`]?.checked) out[f.name] = null;
        break;
      }
      default: {
        const v = el.value.trim();
        if (f.required && !v) throw new Error(`${f.label}: es obligatorio.`);
        if (f.pattern && v && !new RegExp(`^${f.pattern}$`).test(v)) throw new Error(`${f.label}: ${f.patternHelp ?? 'formato no válido'}.`);
        out[f.name] = v || (f.nullable === false ? '' : null);
      }
    }
  }
  return out;
}

/** Lista editable de una tabla: cada fila se despliega en un formulario. */
async function crudList(container, { table, title, fields, order = 'sort', summary, newRow = {}, onChange }) {
  const rows = await rest(`${table}?select=*&order=${order}`);
  const item = (r, i) => {
    const uid = `${table}-${r.id ?? 'new'}`;
    return `<details class="list-item" ${r.id ? '' : 'open'} data-id="${r.id ?? ''}">
      <summary><span>${summary(r)}</span>${r.id ? (r.active === false ? badge('bad', 'Oculto') : '') : badge('nueva', 'Nuevo')}</summary>
      <form class="editor" novalidate>${fields.map((f) => fieldHtml(f, r, uid)).join('')}
        <div class="editor-actions"><button class="btn btn-primary btn-sm" type="submit">Guardar</button>
        ${r.id ? '<button class="btn btn-ghost btn-danger btn-sm" type="button" data-del>Eliminar</button>' : '<button class="btn btn-ghost btn-sm" type="button" data-discard>Descartar</button>'}</div>
      </form></details>`;
  };
  container.innerHTML = `<div class="view-head" style="margin-bottom:12px"><h2 style="margin:0">${esc(title)}</h2><button class="btn btn-ghost btn-xs" type="button" data-add>Añadir</button></div>
    <div data-items>${rows.map(item).join('') || '<p class="muted">No hay elementos.</p>'}</div>`;
  const reload = () => crudList(container, { table, title, fields, order, summary, newRow, onChange });
  $('[data-add]', container).addEventListener('click', () => {
    const holder = $('[data-items]', container);
    if (holder.querySelector('[data-id=""]')) return;
    holder.insertAdjacentHTML('afterbegin', item({ ...newRow, sort: rows.length + 1 }));
    bind(holder.firstElementChild);
    holder.firstElementChild.querySelector('input,textarea')?.focus();
  });
  const bind = (det) => {
    const form = $('form', det);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const data = await readForm(form, fields);
        if (det.dataset.id) await rest(`${table}?id=eq.${det.dataset.id}`, { method: 'PATCH', body: data });
        else await rest(table, { method: 'POST', body: { ...newRow, ...data } });
        toast('Guardado. La web pública ya muestra el cambio.');
        onChange?.();
        reload();
      } catch (ex) {
        toast(ex.message, 'error');
        btn.disabled = false;
      }
    });
    $('[data-del]', form)?.addEventListener('click', async () => {
      if (!(await confirmDialog('¿Eliminar este elemento? Si solo quieres ocultarlo, desmarca «Visible en la web».', { okLabel: 'Eliminar', danger: true }))) return;
      try {
        await rest(`${table}?id=eq.${det.dataset.id}`, { method: 'DELETE' });
        toast('Eliminado.');
        reload();
      } catch (ex) {
        toast(/foreign key|violates/.test(ex.message) ? 'No se puede eliminar porque hay contrataciones que lo usan. Ocúltalo desmarcando «Visible en la web».' : ex.message, 'error');
      }
    });
    $('[data-discard]', form)?.addEventListener('click', () => det.remove());
  };
  $$('details', container).forEach(bind);
}

// =====================================================================
// PAQUETES Y PRECIOS
// =====================================================================
async function packagesView() {
  view.innerHTML = `<div class="view-head"><div><h1>Paquetes y precios</h1><p>Los cambios se reflejan al instante en la web y en la contratación. Los pedidos ya hechos conservan el precio con el que se contrataron.</p></div></div>
    <section class="panel" data-pk></section><section class="panel" data-mt></section><section class="panel" data-ad></section>`;
  await crudList($('[data-pk]', view), {
    table: 'packages',
    title: 'Planes',
    summary: (r) => `<strong>${esc(r.name ?? 'Nuevo plan')}</strong> <span class="muted">${r.price_cents != null ? euros(r.price_cents) : ''}</span>`,
    newRow: { features: [], active: true, revision_rounds: 1 },
    fields: [
      { name: 'name', label: 'Nombre', required: true, max: 80 },
      { name: 'slug', label: 'Identificador en la dirección', required: true, pattern: '[a-z0-9-]+', patternHelp: 'solo minúsculas, números y guiones', help: 'Ejemplo: web-basica. Cambiarlo rompe los enlaces antiguos.' },
      { name: 'price_cents', label: 'Precio (€)', type: 'money', required: true },
      { name: 'audience', label: 'Para quién es', max: 200 },
      { name: 'description', label: 'Descripción', type: 'textarea', max: 400 },
      { name: 'features', label: 'Qué incluye', type: 'lines' },
      { name: 'page_limit', label: 'Límite de páginas (vacío = sin límite)', type: 'number', nullable: true, min: 1, maxv: 100 },
      { name: 'revision_rounds', label: 'Rondas de modificaciones', type: 'number', min: 0, maxv: 10, default: 1 },
      { name: 'badge', label: 'Etiqueta destacada (opcional)', max: 30, help: 'Por ejemplo: «Más elegido».' },
      { name: 'cta_label', label: 'Texto del botón', max: 60 },
      { name: 'highlighted', label: 'Destacar esta tarjeta', type: 'bool' },
      { name: 'active', label: 'Visible en la web', type: 'bool', default: true },
      { name: 'sort', label: 'Orden', type: 'number', min: 0, maxv: 100 },
    ],
  });
  await crudList($('[data-mt]', view), {
    table: 'maintenance_plans',
    title: 'Mantenimiento mensual',
    summary: (r) => `<strong>${esc(r.name ?? 'Nuevo plan')}</strong> <span class="muted">${r.price_cents != null ? euros(r.price_cents, { from: r.price_from, monthly: true }) : ''}</span>`,
    newRow: { features: [], active: true },
    fields: [
      { name: 'name', label: 'Nombre', required: true, max: 80 },
      { name: 'slug', label: 'Identificador', required: true, pattern: '[a-z0-9-]+', patternHelp: 'solo minúsculas, números y guiones' },
      { name: 'price_cents', label: 'Precio mensual (€)', type: 'money', required: true },
      { name: 'price_from', label: 'Mostrar como «desde»', type: 'bool' },
      { name: 'description', label: 'Descripción', type: 'textarea', max: 300 },
      { name: 'features', label: 'Tareas incluidas', type: 'lines' },
      { name: 'response_time', label: 'Tiempo de respuesta', max: 200 },
      { name: 'limits', label: 'Límites del servicio', type: 'textarea', max: 400, help: 'Deja claro qué no incluye. No ofrezcas mantenimiento ilimitado.' },
      { name: 'active', label: 'Visible en la web', type: 'bool', default: true },
      { name: 'sort', label: 'Orden', type: 'number' },
    ],
  });
  await crudList($('[data-ad]', view), {
    table: 'addons',
    title: 'Servicios adicionales',
    summary: (r) => `<strong>${esc(r.name ?? 'Nuevo servicio')}</strong> <span class="muted">${r.price_cents != null ? euros(r.price_cents, { from: r.price_from }) : ''}</span>`,
    newRow: { active: true, unit: 'one_time' },
    fields: [
      { name: 'name', label: 'Nombre', required: true, max: 80 },
      { name: 'description', label: 'Descripción', type: 'textarea', max: 300 },
      { name: 'price_cents', label: 'Precio (€)', type: 'money', required: true },
      { name: 'unit', label: 'Se cobra', type: 'select', options: [['one_time', 'Una vez'], ['monthly', 'Al mes'], ['hourly', 'Por hora']] },
      { name: 'price_from', label: 'Mostrar como «desde»', type: 'bool' },
      { name: 'active', label: 'Activo', type: 'bool', default: true },
      { name: 'sort', label: 'Orden', type: 'number' },
    ],
  });
}

// =====================================================================
// CONTENIDO
// =====================================================================
async function contentView() {
  const s = await one('site_settings?select=hero_title,hero_subtitle,services,process_steps,pricing_note,footer_text&id=eq.1');
  const svc = Array.isArray(s.services) ? s.services : [];
  const steps = Array.isArray(s.process_steps) ? s.process_steps : [];
  const SVC_KEYS = [['diseno', 'Diseño web'], ['tiendas', 'Tiendas online'], ['landing', 'Landing pages'], ['renovacion', 'Renovación'], ['reservas', 'Reservas'], ['mantenimiento', 'Mantenimiento']];
  view.innerHTML = `
    <div class="view-head"><div><h1>Contenido de la web</h1><p>Textos, servicios, pasos, preguntas frecuentes y galería.</p></div></div>
    <form class="panel editor" data-texts>
      <h2>Portada y textos</h2>
      <div class="field"><label for="c-ht">Título de la portada</label><input class="input" id="c-ht" name="hero_title" maxlength="160" value="${esc(s.hero_title)}"></div>
      <div class="field"><label for="c-hs">Subtítulo</label><textarea class="input" id="c-hs" name="hero_subtitle" rows="2" maxlength="300">${esc(s.hero_subtitle)}</textarea></div>
      <div class="field"><label for="c-pn">Nota bajo los precios</label><textarea class="input" id="c-pn" name="pricing_note" rows="2" maxlength="400">${esc(s.pricing_note ?? '')}</textarea></div>
      <div class="field"><label for="c-ft">Texto del pie</label><input class="input" id="c-ft" name="footer_text" maxlength="300" value="${esc(s.footer_text ?? '')}"></div>
      <h3>Servicios (máximo 8)</h3>
      ${Array.from({ length: 8 }, (_, i) => {
        const x = svc[i] ?? {};
        return `<div class="grid-3" style="align-items:end"><div class="field"><label for="sv-t${i}">Servicio ${i + 1}</label><input class="input" id="sv-t${i}" name="svc_title_${i}" maxlength="80" value="${esc(x.title ?? '')}"></div>
          <div class="field"><label for="sv-d${i}">Descripción</label><input class="input" id="sv-d${i}" name="svc_desc_${i}" maxlength="300" value="${esc(x.description ?? '')}"></div>
          <div class="field"><label for="sv-k${i}">Icono</label><select class="input" id="sv-k${i}" name="svc_key_${i}">${SVC_KEYS.map(([k, l]) => `<option value="${k}" ${k === x.key ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`;
      }).join('')}
      <h3>Cómo trabajamos (pasos en orden)</h3>
      ${Array.from({ length: 6 }, (_, i) => {
        const x = steps[i] ?? {};
        return `<div class="grid-2"><div class="field"><label for="st-t${i}">Paso ${i + 1}</label><input class="input" id="st-t${i}" name="step_title_${i}" maxlength="100" value="${esc(x.title ?? '')}"></div>
          <div class="field"><label for="st-d${i}">Descripción</label><input class="input" id="st-d${i}" name="step_desc_${i}" maxlength="300" value="${esc(x.description ?? '')}"></div></div>`;
      }).join('')}
      <p class="help">Deja vacío el título de un servicio o paso para no mostrarlo.</p>
      <div class="editor-actions"><button class="btn btn-primary btn-sm" type="submit">Guardar textos</button></div>
    </form>
    <section class="panel" data-faq></section>
    <section class="panel" data-gal></section>`;

  $('[data-texts]', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const g = (n) => f.elements[n].value.trim();
    const services = [];
    for (let i = 0; i < 8; i++) if (g(`svc_title_${i}`)) services.push({ key: g(`svc_key_${i}`), title: g(`svc_title_${i}`), description: g(`svc_desc_${i}`) });
    const process_steps = [];
    for (let i = 0; i < 6; i++) if (g(`step_title_${i}`)) process_steps.push({ title: g(`step_title_${i}`), description: g(`step_desc_${i}`) });
    if (!g('hero_title')) return toast('El título de la portada no puede estar vacío.', 'error');
    await rest('site_settings?id=eq.1', {
      method: 'PATCH',
      body: { hero_title: g('hero_title'), hero_subtitle: g('hero_subtitle'), pricing_note: g('pricing_note') || null, footer_text: g('footer_text') || null, services, process_steps },
    });
    toast('Textos guardados.');
  });

  await crudList($('[data-faq]', view), {
    table: 'faqs',
    title: 'Preguntas frecuentes',
    summary: (r) => esc(r.question ?? 'Nueva pregunta'),
    newRow: { active: true },
    fields: [
      { name: 'question', label: 'Pregunta', required: true, max: 200 },
      { name: 'answer', label: 'Respuesta', type: 'textarea', max: 1500 },
      { name: 'active', label: 'Visible en la web', type: 'bool', default: true },
      { name: 'sort', label: 'Orden', type: 'number' },
    ],
  });
  await crudList($('[data-gal]', view), {
    table: 'demo_projects',
    title: 'Galería de diseños de demostración',
    summary: (r) =>
      `<span style="display:flex;gap:12px;align-items:center"><span style="position:relative;width:64px;height:44px;border-radius:6px;overflow:hidden;flex:none;font-size:4px">${r.title ? renderMock(r) : ''}</span><span><strong>${esc(r.title ?? 'Nuevo diseño')}</strong><br><span class="muted small">${esc(r.sector ?? '')}</span></span></span>`,
    newRow: { active: true, layout: 'generic' },
    fields: [
      { name: 'title', label: 'Nombre del proyecto ficticio', required: true, max: 80 },
      { name: 'sector', label: 'Sector', required: true, max: 80 },
      { name: 'description', label: 'Descripción', type: 'textarea', max: 300 },
      { name: 'layout', label: 'Estilo de la miniatura', type: 'select', options: Object.entries(LAYOUT_NAMES) },
      { name: 'palette', label: 'Colores de la miniatura', type: 'color3' },
      { name: 'image_url', label: 'Imagen propia (opcional, sustituye a la miniatura)', type: 'image', folder: 'galeria' },
      { name: 'active', label: 'Visible en la web', type: 'bool', default: true },
      { name: 'sort', label: 'Orden', type: 'number' },
    ],
  });
}

// =====================================================================
// AJUSTES
// =====================================================================
async function settingsView() {
  const s = await one('site_settings?select=*&id=eq.1');
  const text = (name, label, max = 200, extra = '') =>
    `<div class="field"><label for="s-${name}">${label}</label><input class="input" id="s-${name}" name="${name}" maxlength="${max}" value="${esc(s[name] ?? '')}" ${extra}></div>`;
  view.innerHTML = `
    <div class="view-head"><div><h1>Ajustes</h1><p>Marca, contacto, datos legales y pagos.</p></div></div>
    <form class="panel editor" data-settings>
      <h2>Marca</h2>
      <div class="grid-2">${text('business_name', 'Nombre de la agencia', 80)}
        <div class="field"><label for="s-accent">Color de acento</label><div class="color-row"><input type="color" id="s-accent" name="accent_color" value="${esc(s.accent_color)}"><span class="muted small">Se usa en botones y detalles. Elige uno con buen contraste sobre fondo oscuro.</span></div></div></div>
      <div class="field"><span class="label">Logotipo</span>
        <div class="color-row">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="Logotipo actual" style="height:36px;width:auto;background:#fff1;border-radius:6px;padding:4px">` : '<span class="muted small">Sin logotipo: se muestra el nombre.</span>'}</div>
        <input class="input" type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="Subir logotipo">
        ${s.logo_url ? '<label class="check"><input type="checkbox" name="logo_remove"><span>Quitar el logotipo</span></label>' : ''}</div>
      <h2 style="margin-top:10px">Contacto</h2>
      <div class="grid-2">${text('contact_email', 'Correo de contacto (visible en la web)', 254, 'type="email"')}${text('whatsapp', 'WhatsApp (con prefijo, por ejemplo +34 600 000 000)', 30)}</div>
      <h2 style="margin-top:10px">SEO</h2>
      <div class="grid-2">${text('seo_title', 'Título para buscadores (opcional)', 70)}${text('seo_description', 'Descripción para buscadores (opcional)', 170)}</div>
      <h2 style="margin-top:10px">Datos legales</h2>
      <p class="help">Aparecen en el aviso legal, la política de privacidad y las condiciones. No se inventa ninguno: si falta alguno, esas páginas muestran un aviso.</p>
      <div class="grid-2">${text('legal_owner_name', 'Titular (nombre o razón social)', 160)}${text('legal_tax_id', 'NIF/CIF', 30)}${text('legal_address', 'Domicilio', 300)}${text('legal_email', 'Correo para asuntos legales y de privacidad', 254, 'type="email"')}${text('legal_registry', 'Datos registrales (si es sociedad)', 300)}${text('terms_version', 'Versión de las condiciones de contratación', 20)}</div>
      <h2 style="margin-top:10px">Pagos</h2>
      <div class="grid-2">
        <div class="field"><label for="s-pm">Al contratar se cobra</label><select class="input" id="s-pm" name="payment_mode"><option value="full" ${s.payment_mode === 'full' ? 'selected' : ''}>El importe completo</option><option value="deposit" ${s.payment_mode === 'deposit' ? 'selected' : ''}>Una señal inicial</option></select></div>
        <div class="field"><label for="s-dp">Porcentaje de la señal</label><input class="input" id="s-dp" name="deposit_percent" type="number" min="1" max="100" value="${s.deposit_percent}"></div>
      </div>
      <h2 style="margin-top:10px">Analítica (opcional)</h2>
      ${text('analytics_snippet_url', 'Dirección del script de analítica (https://…)', 300, 'placeholder="Vacío = sin analítica ni aviso de cookies"')}
      <p class="help">Si lo rellenas, la web pedirá consentimiento antes de cargarlo y solo lo cargará si el visitante acepta. Si tu hosting usa la cabecera de seguridad incluida (_headers), añade también ese dominio a script-src.</p>
      <div class="editor-actions"><button class="btn btn-primary btn-sm" type="submit">Guardar ajustes</button></div>
    </form>`;
  $('[data-settings]', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const g = (n) => f.elements[n].value.trim();
    const btn = f.querySelector('button[type=submit]');
    const emailOk = (v) => !v || /^\S+@\S+\.\S+$/.test(v);
    if (!emailOk(g('contact_email')) || !emailOk(g('legal_email'))) return toast('Revisa los correos: alguno no es válido.', 'error');
    if (g('analytics_snippet_url') && !/^https:\/\//.test(g('analytics_snippet_url'))) return toast('La dirección de analítica debe empezar por https://', 'error');
    btn.disabled = true;
    try {
      const body = {
        business_name: g('business_name') || 'WEBS QUE VENDEN',
        accent_color: f.elements.accent_color.value.toLowerCase(),
        contact_email: g('contact_email') || null,
        whatsapp: g('whatsapp') || null,
        seo_title: g('seo_title') || null,
        seo_description: g('seo_description') || null,
        legal_owner_name: g('legal_owner_name') || null,
        legal_tax_id: g('legal_tax_id') || null,
        legal_address: g('legal_address') || null,
        legal_email: g('legal_email') || null,
        legal_registry: g('legal_registry') || null,
        terms_version: g('terms_version') || '1.0',
        payment_mode: f.elements.payment_mode.value === 'deposit' ? 'deposit' : 'full',
        deposit_percent: Math.min(100, Math.max(1, Math.round(Number(f.elements.deposit_percent.value) || 50))),
        analytics_snippet_url: g('analytics_snippet_url') || null,
      };
      const file = f.elements.logo.files?.[0];
      if (file) body.logo_url = await uploadImage(file, 'logo');
      else if (f.elements.logo_remove?.checked) body.logo_url = null;
      await rest('site_settings?id=eq.1', { method: 'PATCH', body });
      applyBrand({ ...s, ...body });
      toast('Ajustes guardados. La web pública ya está actualizada.');
      settingsView();
    } catch (ex) {
      toast(ex.message, 'error');
      btn.disabled = false;
    }
  });
}

// =====================================================================
// INTEGRACIONES
// =====================================================================
async function integrationsView() {
  let st = null;
  let fnError = null;
  try {
    st = (await adminFn({ action: 'status' })).integrations;
  } catch (e) {
    fnError = e.message;
  }
  const priv = await one('private_settings?select=calendar_feed_key&id=eq.1');
  const site = await one('site_settings?select=booking_provider,calendly_url,legal_owner_name,legal_tax_id,legal_address,legal_email&id=eq.1');
  const feed = priv ? `${SUPABASE_URL}/functions/v1/calendar-feed?key=${priv.calendar_feed_key}` : '';
  const item = (on, title, text) => `<div class="status-item"><span class="dot ${on ? 'on' : ''}" aria-hidden="true"></span><div><strong>${esc(title)}</strong> <span class="muted small">${on ? 'Activo' : 'Pendiente'}</span><p>${text}</p></div></div>`;
  const legalOk = site.legal_owner_name && site.legal_tax_id && site.legal_address && site.legal_email;
  view.innerHTML = `
    <div class="view-head"><div><h1>Integraciones</h1><p>Qué está funcionando y qué falta por configurar. Las claves secretas nunca se ven aquí: se guardan en Supabase.</p></div></div>
    ${fnError ? `<p class="form-error" style="margin-bottom:18px">No se pudo consultar el servidor: ${esc(fnError)} Revisa que las Edge Functions estén desplegadas (ver README).</p>` : ''}
    <div class="status-list panel">
      ${item(true, 'Base de datos y acceso al panel', 'Supabase responde y tu cuenta es administradora.')}
      ${item(st?.leadSecret, 'Firma del formulario inicial (LEAD_SECRET)', 'Permite vincular las llamadas y contrataciones con la solicitud del formulario. Sin ella las solicitudes se guardan igual, pero no se vinculan automáticamente.')}
      ${item(st?.siteUrl, 'Dirección de la web (SITE_URL)', `Se usa en los enlaces de los correos y en Stripe. Valor actual: <code>${esc(st?.siteUrlValue ?? '—')}</code>`)}
      ${item(st?.email, 'Correo (Resend)', 'Confirmaciones de solicitud, reservas, cambios y pagos. Sin configurar, no se envía ningún correo y el panel lo indica en cada reserva.')}
      ${item(st?.adminEmail, 'Avisos al administrador (ADMIN_NOTIFY_EMAIL)', 'Te avisa por correo de nuevas solicitudes, llamadas y pagos.')}
      ${item(st?.stripe, `Pagos con Stripe${st?.stripe ? (st.stripeTestMode ? ' (modo de prueba)' : ' (modo real)') : ''}`, `Sin Stripe, las contrataciones se registran como «Pago online no activado» y no se cobra nada. Dirección del webhook para Stripe: <code>${esc(st?.webhookUrl ?? `${SUPABASE_URL}/functions/v1/stripe-webhook`)}</code>`)}
      ${item(site.booking_provider === 'calendly' ? Boolean(site.calendly_url) : bookingCfg?.enabled, site.booking_provider === 'calendly' ? 'Reservas con Calendly' : 'Reservas con el calendario propio', site.booking_provider === 'calendly' ? 'La página de reservas inserta tu enlace de Calendly.' : 'Se activan y configuran en <a href="#/disponibilidad">Disponibilidad</a>.')}
      ${item(legalOk, 'Datos legales', 'Necesarios para el aviso legal, la privacidad y las condiciones. Complétalos en <a href="#/ajustes">Ajustes</a> y revisa los textos con un profesional.')}
    </div>
    <section class="panel">
      <h2>Ver las llamadas en Google Calendar</h2>
      <p class="muted">Suscríbete a este calendario privado: en Google Calendar, «Otros calendarios» → «Desde URL». También funciona en Apple Calendar y Outlook. Google lo actualiza cada pocas horas.</p>
      <code class="code" data-feed>${esc(feed)}</code>
      <div class="editor-actions" style="margin-top:12px"><button class="btn btn-ghost btn-xs" type="button" data-copy>Copiar enlace</button><button class="btn btn-ghost btn-danger btn-xs" type="button" data-rotate>Generar un enlace nuevo</button></div>
      <p class="help" style="margin-top:8px">Este enlace da acceso a los nombres y datos de las llamadas: no lo compartas. Si se filtra, genera uno nuevo.</p>
    </section>
    <section class="panel"><h2>Probar el correo</h2>
      <p class="muted">Envía un aviso de prueba a la dirección configurada en ADMIN_NOTIFY_EMAIL.</p>
      <button class="btn btn-ghost btn-sm" type="button" data-test-email ${st?.adminEmail ? '' : 'disabled'}>Enviar correo de prueba</button></section>`;
  $('[data-copy]', view).addEventListener('click', async () => {
    await navigator.clipboard?.writeText(feed).catch(() => {});
    toast('Enlace copiado.');
  });
  $('[data-rotate]', view).addEventListener('click', async () => {
    if (!(await confirmDialog('El enlace actual dejará de funcionar. ¿Generar uno nuevo?', { okLabel: 'Generar', danger: true }))) return;
    const key = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
    await rest('private_settings?id=eq.1', { method: 'PATCH', body: { calendar_feed_key: key } });
    toast('Enlace nuevo generado.');
    integrationsView();
  });
  $('[data-test-email]', view).addEventListener('click', async () => {
    try {
      const r = await adminFn({ action: 'test_email' });
      toast(r.ok ? 'Correo de prueba enviado.' : 'No se pudo enviar.', r.ok ? 'ok' : 'error');
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
(async () => {
  const content = await loadContent();
  applyBrand(content.settings);
  if (!configured()) return showLogin('Falta configurar Supabase en config.js (ver README).');
  session = loadSession();
  if (!session) return showLogin();
  try {
    await enter();
  } catch (e) {
    if (e.message !== 'sesión cerrada') showLogin(e.message);
  }
})();
