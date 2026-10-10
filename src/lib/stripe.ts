import 'server-only';
import Stripe from 'stripe';
import { integrations } from './env';

let client: Stripe | null = null;

/** Devuelve el cliente de Stripe o null si no está configurado. */
export function getStripe(): Stripe | null {
  if (!integrations.stripe()) return null;
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

/** Importe a cobrar ahora según el modo de pago configurado. */
export function amountDueNow(totalCents: number, mode: 'full' | 'deposit', depositPercent: number): number {
  if (mode === 'full') return totalCents;
  const pct = Math.min(100, Math.max(1, Math.round(depositPercent)));
  return Math.round((totalCents * pct) / 100);
}
