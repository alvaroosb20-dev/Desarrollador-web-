import 'server-only';
import { publicClient } from './supabase/server';
import { normalizeWeeklyHours, type BookingConfig } from './slots';
import type { Addon, DemoProject, Faq, MaintenancePlan, Package, SiteSettings } from './types';

export const DEFAULT_SETTINGS: SiteSettings = {
  business_name: 'WEBS QUE VENDEN',
  logo_url: null,
  accent_color: '#c8f26d',
  contact_email: null,
  whatsapp: null,
  hero_title: 'Tu próxima web puede ser el comienzo de algo grande',
  hero_subtitle:
    'Diseñamos páginas web modernas para que tu negocio destaque, consiga clientes y venda por Internet.',
  services: [],
  process_steps: [],
  pricing_note: null,
  footer_text: null,
  legal_owner_name: null,
  legal_tax_id: null,
  legal_address: null,
  legal_email: null,
  legal_registry: null,
  terms_version: '1.0',
  payment_mode: 'full',
  deposit_percent: 50,
};

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Si Supabase no responde, la web se muestra igualmente (sin ese bloque). */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error('Error leyendo contenido público', e);
    return fallback;
  }
}

export async function getSettings(): Promise<SiteSettings> {
  try {
    const { data, error } = await publicClient().from('site_settings').select('*').eq('id', 1).maybeSingle();
    if (error || !data) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...data,
      services: asArray(data.services),
      process_steps: asArray(data.process_steps),
    } as SiteSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function getPackages(): Promise<Package[]> {
  return safe(async () => {
    const { data } = await publicClient().from('packages').select('*').eq('active', true).order('sort');
    return (data ?? []).map((p: any) => ({ ...p, features: asArray<string>(p.features) }));
  }, []);
}

export async function getPackageBySlug(slug: string): Promise<Package | null> {
  return safe(async () => {
    const { data } = await publicClient().from('packages').select('*').eq('slug', slug).eq('active', true).maybeSingle();
    return data ? ({ ...data, features: asArray<string>(data.features) } as Package) : null;
  }, null);
}

export async function getMaintenancePlans(): Promise<MaintenancePlan[]> {
  return safe(async () => {
    const { data } = await publicClient().from('maintenance_plans').select('*').eq('active', true).order('sort');
    return (data ?? []).map((p: any) => ({ ...p, features: asArray<string>(p.features) }));
  }, []);
}

export async function getAddons(): Promise<Addon[]> {
  return safe(async () => {
    const { data } = await publicClient().from('addons').select('*').eq('active', true).order('sort');
    return (data ?? []) as Addon[];
  }, []);
}

export async function getFaqs(): Promise<Faq[]> {
  return safe(async () => {
    const { data } = await publicClient().from('faqs').select('*').eq('active', true).order('sort');
    return (data ?? []) as Faq[];
  }, []);
}

export async function getDemos(): Promise<DemoProject[]> {
  return safe(async () => {
    const { data } = await publicClient().from('demo_projects').select('*').eq('active', true).order('sort');
    return (data ?? []) as DemoProject[];
  }, []);
}

export type BookingSettings = BookingConfig & { meeting_details: string };

export async function getBookingSettings(): Promise<BookingSettings> {
  const data = await safe(async () => {
    const { data } = await publicClient().from('booking_settings').select('*').eq('id', 1).maybeSingle();
    return data;
  }, null as any);
  return {
    enabled: Boolean(data?.enabled),
    timezone: data?.timezone ?? 'Atlantic/Canary',
    duration_min: data?.duration_min ?? 15,
    buffer_min: data?.buffer_min ?? 5,
    min_notice_min: data?.min_notice_min ?? 720,
    max_advance_days: data?.max_advance_days ?? 30,
    weekly_hours: normalizeWeeklyHours(data?.weekly_hours),
    meeting_details: data?.meeting_details ?? '',
  };
}
