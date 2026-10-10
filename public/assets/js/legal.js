// Rellena las páginas legales con los datos reales del panel. No se inventa nada:
// si falta un dato, se marca como pendiente y se muestra un aviso.
import { $, $$, boot, openConsentBanner } from './common.js';

const content = await boot();
const s = content.settings;
let missing = false;
$$('[data-legal]').forEach((el) => {
  const key = el.dataset.legal;
  let v = s[key];
  if (key === 'updated_at') v = s.updated_at ? new Date(s.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  if (v) {
    el.textContent = v;
  } else if (key === 'legal_registry') {
    el.textContent = 'no aplica o pendiente de indicar';
  } else {
    missing = true;
    el.textContent = '[pendiente de completar]';
    el.classList.add('pending');
  }
});
if (missing) $('[data-legal-warning]')?.removeAttribute('hidden');
const tax = $('[data-tax-note]');
if (tax && s.pricing_note) tax.textContent = s.pricing_note;

$('[data-open-consent]')?.addEventListener('click', () => openConsentBanner(s));
if (s.analytics_snippet_url) {
  const t = $('[data-analytics-text]');
  if (t) t.textContent = 'Usamos una herramienta de analítica para saber cómo se usa la web. Solo se carga si la aceptas en el aviso de cookies, y puedes cambiar tu decisión en cualquier momento con el botón de abajo.';
}
