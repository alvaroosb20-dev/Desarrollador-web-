// Selector de día y hora reutilizable (reservas nuevas y cambio de cita).
// Solo muestra los huecos que el servidor confirma como libres.
import { $, $$, esc, icon } from './common.js';
import { tzLabel, zonedParts } from './time.js';

export const visitorTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Atlantic/Canary';
  } catch {
    return 'Atlantic/Canary';
  }
};

const pad = (n) => String(n).padStart(2, '0');
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Agrupa los huecos (ISO en UTC) por fecha local del visitante. */
export function groupByLocalDate(days, tz) {
  const map = new Map();
  for (const d of days) {
    for (const iso of d.slots) {
      const p = zonedParts(new Date(iso), tz);
      const key = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(iso);
    }
  }
  for (const list of map.values()) list.sort();
  return map;
}

export const timeLabel = (iso, tz) => new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const longDate = (iso, tz) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Pinta el calendario en `el`. Llama a onSelect(iso | null) al elegir hora.
 * @param {HTMLElement} el
 * @param {{days: {date:string, slots:string[]}[]}} data
 */
export function mountPicker(el, data, onSelect) {
  const tz = visitorTz();
  const byDate = groupByLocalDate(data.days, tz);
  const dates = [...byDate.keys()].sort();
  let selectedDate = null;
  let selectedSlot = null;
  let month = dates.length ? dates[0].slice(0, 7) : null;

  function draw() {
    if (!month) {
      el.innerHTML = '<p class="notice">Ahora mismo no quedan horarios libres. Escríbenos y buscamos un momento.</p>';
      return;
    }
    const [y, m] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
    const mi = months.indexOf(month);
    let cells = DOW.map((d) => `<div class="cal-dow" aria-hidden="true">${d}</div>`).join('');
    cells += '<div></div>'.repeat(lead);
    for (let d = 1; d <= daysIn; d++) {
      const key = `${month}-${pad(d)}`;
      const free = byDate.has(key);
      const label = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
      cells += free
        ? `<button type="button" class="cal-day free" data-date="${key}" aria-pressed="${key === selectedDate}" aria-label="${label}, ${byDate.get(key).length} horarios libres">${d}</button>`
        : `<button type="button" class="cal-day" disabled aria-label="${label}, sin horarios">${d}</button>`;
    }
    const slots = selectedDate ? byDate.get(selectedDate) : null;
    el.innerHTML = `
      <div class="cal-head">
        <h3 aria-live="polite">${MONTHS[m - 1]} de ${y}</h3>
        <div class="cal-nav">
          <button type="button" class="icon-btn" data-month="-1" ${mi <= 0 ? 'disabled' : ''} aria-label="Mes anterior">${icon('back', 18)}</button>
          <button type="button" class="icon-btn flip" data-month="1" ${mi >= months.length - 1 ? 'disabled' : ''} aria-label="Mes siguiente">${icon('back', 18)}</button>
        </div>
      </div>
      <div class="cal-grid">${cells}</div>
      <div style="margin-top:22px">
        ${
          slots
            ? `<h3 class="label" id="slots-title">Horas libres el ${esc(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${selectedDate}T12:00:00Z`)))}</h3>
               <div class="slots" role="group" aria-labelledby="slots-title">${slots
                 .map((iso) => `<button type="button" class="slot" data-slot="${iso}" aria-pressed="${iso === selectedSlot}">${timeLabel(iso, tz)}</button>`)
                 .join('')}</div>`
            : '<p class="muted small" style="margin:0">Elige un día marcado para ver las horas libres.</p>'
        }
        <p class="muted small" style="margin:14px 0 0">Horas en tu zona horaria: ${esc(tzLabel(tz))}.</p>
      </div>`;
  }

  el.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-month]');
    if (mb && !mb.disabled) {
      const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
      month = months[months.indexOf(month) + Number(mb.dataset.month)] ?? month;
      draw();
      return;
    }
    const db = e.target.closest('[data-date]');
    if (db) {
      selectedDate = db.dataset.date;
      selectedSlot = null;
      onSelect(null);
      draw();
      $('.slot', el)?.focus();
      return;
    }
    const sb = e.target.closest('[data-slot]');
    if (sb) {
      selectedSlot = sb.dataset.slot;
      $$('.slot', el).forEach((b) => b.setAttribute('aria-pressed', String(b === sb)));
      onSelect(selectedSlot, tz);
    }
  });
  draw();
  return { tz, reset: () => ((selectedSlot = null), draw()) };
}
