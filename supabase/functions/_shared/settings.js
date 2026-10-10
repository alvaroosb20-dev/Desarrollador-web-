import { selectOne } from './db.js';
import { normalizeBookingSettings } from './slots.js';

export const DEFAULT_SETTINGS = {
  business_name: 'WEBS QUE VENDEN',
  contact_email: null,
  terms_version: '1.0',
  payment_mode: 'full',
  deposit_percent: 50,
};

export async function getSettings() {
  const { data, error } = await selectOne('site_settings', 'select=*&id=eq.1');
  if (error || !data) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...data };
}

export async function getBookingSettings() {
  const { data, error } = await selectOne('booking_settings', 'select=*&id=eq.1');
  if (error) throw new Error('No se pudo leer la configuración de reservas.');
  return normalizeBookingSettings(data);
}
