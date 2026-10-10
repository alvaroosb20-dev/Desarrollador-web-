// Stripe por su API REST (sin SDK) y verificación de firma de webhooks con Web Crypto.
import { env } from './http.js';
import { hmacHex, safeEqual } from './crypto.js';

export const stripeConfigured = () => Boolean(env('STRIPE_SECRET_KEY') && env('STRIPE_WEBHOOK_SECRET'));
export const stripeTestMode = () => env('STRIPE_SECRET_KEY').startsWith('sk_test_') || env('STRIPE_SECRET_KEY').startsWith('rk_test_');

/** Convierte un objeto anidado al formato application/x-www-form-urlencoded de Stripe. */
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? formEncode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripeRequest(method, path, params, idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-06-20',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const base = env('STRIPE_API_BASE') || 'https://api.stripe.com';
  const res = await fetch(`${base}/v1/${path}`, { method, headers, body: params ? formEncode(params).toString() : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data?.error?.message ?? 'error'}`);
  return data;
}

/**
 * Verifica la cabecera Stripe-Signature (esquema v1) y devuelve el evento.
 * Tolerancia de 5 minutos frente a reenvíos antiguos.
 */
export async function verifyWebhook(rawBody, signatureHeader, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!signatureHeader || !secret) return null;
  const parts = Object.fromEntries([]);
  const v1 = [];
  for (const item of signatureHeader.split(',')) {
    const [k, v] = item.split('=');
    if (k === 't') parts.t = v;
    if (k === 'v1') v1.push(v);
  }
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !v1.length) return null;
  if (Math.abs(nowSec - t) > toleranceSec) return null;
  const expected = await hmacHex(secret, `${parts.t}.${rawBody}`);
  if (!v1.some((s) => safeEqual(s, expected))) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}
