import 'server-only';
import { headers } from 'next/headers';
import { sha256Hex } from './lead-cookie';
import { serviceClient } from './supabase/server';

/** IP del visitante cifrada (nunca se guarda la IP en claro). */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || h.get('cf-connecting-ip') || 'unknown';
  const salt = process.env.LEAD_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return (await sha256Hex(`${salt}:${ip}`)).slice(0, 32);
}

/**
 * Devuelve true si la acción está permitida. Si la base de datos falla,
 * se permite (para no bloquear clientes reales) pero se registra el error.
 */
export async function rateLimit(action: string, ipHash: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await serviceClient().rpc('hit_rate_limit', {
      p_key: `${action}:${ipHash}`,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('rate limit error', error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error('rate limit exception', e);
    return true;
  }
}
