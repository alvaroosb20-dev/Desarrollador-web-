// Cookie firmada que recuerda que el visitante ya completó el formulario inicial.
// Contiene solo el id de la solicitud y una firma HMAC: ningún dato personal.
// Usa Web Crypto para funcionar tanto en el middleware (edge) como en Node.

export const LEAD_COOKIE = 'wqv_lead';
export const LEAD_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 días

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.LEAD_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('Falta LEAD_COOKIE_SECRET');
  return s;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(`lead:${value}`)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function signLead(requestId: string): Promise<string> {
  return `${requestId}.${await hmac(requestId)}`;
}

/** Devuelve el id de la solicitud si la cookie es válida; si no, null. */
export async function verifyLead(cookieValue: string | undefined | null): Promise<string | null> {
  if (!cookieValue) return null;
  const [id, sig] = cookieValue.split('.');
  if (!id || !sig || !UUID_RE.test(id)) return null;
  try {
    return safeEqual(sig, await hmac(id)) ? id : null;
  } catch {
    return null;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
