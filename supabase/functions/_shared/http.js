// Utilidades HTTP comunes de las Edge Functions: CORS, JSON, antispam.
import { sha256Hex } from './crypto.js';
import { rpc } from './db.js';

export const env = (name) => (globalThis.Deno ? Deno.env.get(name) : globalThis.process?.env?.[name]) ?? '';

export function siteUrl() {
  return (env('SITE_URL') || 'http://localhost:8080').replace(/\/+$/, '');
}

/** Orígenes permitidos: SITE_URL y, opcionalmente, ALLOWED_ORIGINS (separados por comas). */
function allowedOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  const list = [siteUrl(), ...env('ALLOWED_ORIGINS').split(',')]
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (list.includes(origin)) return origin;
  // En pruebas locales se acepta localhost.
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && /localhost|127\.0\.0\.1/.test(siteUrl())) return origin;
  return null;
}

export function corsHeaders(req) {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  };
}

export function json(req, payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(req), ...extra },
  });
}

export function fail(req, error, status = 400, field) {
  return json(req, { ok: false, error, ...(field ? { field } : {}) }, status);
}

/** Envuelve un manejador: responde a OPTIONS, captura errores y rechaza orígenes no permitidos. */
export function handler(fn, { methods = ['POST'], allowAnyOrigin = false } = {}) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
    if (!methods.includes(req.method)) return fail(req, 'Método no permitido.', 405);
    // Las peticiones desde navegador deben venir de la web propia.
    if (!allowAnyOrigin && req.headers.get('origin') && !allowedOrigin(req)) {
      return fail(req, 'Origen no permitido.', 403);
    }
    try {
      return await fn(req);
    } catch (e) {
      console.error('Error no controlado', e);
      return fail(req, 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos segundos.', 500);
    }
  };
}

export async function readJson(req) {
  try {
    const text = await req.text();
    if (text.length > 64 * 1024) return null;
    const body = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/** IP del visitante cifrada: nunca se guarda en claro. */
export async function ipHash(req) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'unknown';
  return (await sha256Hex(`${env('LEAD_SECRET')}:${ip}`)).slice(0, 32);
}

/** true si la acción está permitida. Si la base de datos falla, se permite (y se registra). */
export async function rateLimit(action, hash, max, windowSeconds) {
  const { data, error } = await rpc('hit_rate_limit', { p_key: `${action}:${hash}`, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
    console.error('rate limit error', error);
    return true;
  }
  return data !== false;
}

/** Envíos automáticos: campo trampa relleno o formulario enviado demasiado rápido. */
export function looksLikeBot(body, minMs = 2500) {
  if (typeof body.website === 'string' && body.website.trim() !== '') return true;
  const started = Number(body.startedAt);
  if (!Number.isFinite(started)) return true;
  const elapsed = Date.now() - started;
  return elapsed < minMs || elapsed > 1000 * 60 * 60 * 24 * 2;
}

export const validKey = (k) => typeof k === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(k);
