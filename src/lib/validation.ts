// Validación sin dependencias. Se usa en cliente (mensajes inmediatos)
// y SIEMPRE se repite en el servidor antes de guardar nada.

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,253}\.[a-z]{2,24}$/i;

export function cleanText(v: unknown, max = 500): string {
  if (typeof v !== 'string') return '';
  // elimina caracteres de control (excepto saltos de línea) y recorta
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function validateName(v: string): string | null {
  if (!v) return 'Escribe tu nombre.';
  if (v.length < 2) return 'El nombre es demasiado corto.';
  if (v.length > 80) return 'El nombre es demasiado largo.';
  return null;
}

export function validateEmail(v: string): string | null {
  if (!v) return 'Escribe tu correo electrónico.';
  if (!EMAIL_RE.test(v) || v.length > 254) return 'Revisa el correo: no parece válido.';
  return null;
}

export function normalizePhone(v: string): string {
  return v.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

export function validatePhone(v: string, required = false): string | null {
  if (!v) return required ? 'Escribe un teléfono.' : null;
  const digits = normalizePhone(v).replace('+', '');
  if (digits.length < 9 || digits.length > 15) return 'Revisa el teléfono: debe tener entre 9 y 15 dígitos.';
  return null;
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Envíos automáticos: campo trampa relleno o formulario enviado demasiado rápido. */
export function looksLikeBot(body: { website?: unknown; startedAt?: unknown }, minMs = 2500): boolean {
  if (typeof body.website === 'string' && body.website.trim() !== '') return true;
  const started = Number(body.startedAt);
  if (!Number.isFinite(started)) return true;
  const elapsed = Date.now() - started;
  return elapsed < minMs || elapsed > 1000 * 60 * 60 * 24 * 2;
}
