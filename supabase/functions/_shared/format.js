export function euros(cents, opts = {}) {
  const v = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
  return `${opts.from ? 'desde ' : ''}${v}${opts.monthly ? '/mes' : ''}`;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const asArray = (v) => (Array.isArray(v) ? v : []);

export function amountDueNow(totalCents, mode, depositPercent) {
  if (mode !== 'deposit') return totalCents;
  const pct = Math.min(100, Math.max(1, Math.round(depositPercent)));
  return Math.round((totalCents * pct) / 100);
}
