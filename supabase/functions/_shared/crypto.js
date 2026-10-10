// Criptografía con Web Crypto (sin dependencias).
const enc = new TextEncoder();

export function toHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(value) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

export async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

export function base64(str) {
  const bytes = enc.encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Comprobante de que el visitante completó el formulario inicial. Contiene solo
 * el id de la solicitud y una firma HMAC: ningún dato personal.
 */
export async function signLead(secret, requestId) {
  return `${requestId}.${await hmacHex(secret, `lead:${requestId}`)}`;
}

export async function verifyLead(secret, token) {
  if (!secret || typeof token !== 'string') return null;
  const [id, sig] = token.split('.');
  if (!id || !sig || !UUID_RE.test(id)) return null;
  return safeEqual(sig, await hmacHex(secret, `lead:${id}`)) ? id : null;
}
