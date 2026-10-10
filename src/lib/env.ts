// Lectura centralizada de variables de entorno y estado de las integraciones.
// Este archivo solo debe importarse desde código de servidor salvo `siteUrl`.

export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return raw.replace(/\/+$/, '');
}

export const integrations = {
  supabase(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  email(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  },
  adminEmail(): boolean {
    return Boolean(this.email() && process.env.ADMIN_NOTIFY_EMAIL);
  },
  stripe(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  },
  stripeTestMode(): boolean {
    return (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');
  },
  leadSecret(): boolean {
    return Boolean(process.env.LEAD_COOKIE_SECRET && process.env.LEAD_COOKIE_SECRET.length >= 32);
  },
  siteUrl(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_SITE_URL);
  },
};

export function leadGateEnabled(): boolean {
  return (process.env.LEAD_GATE || 'on').toLowerCase() !== 'off';
}
