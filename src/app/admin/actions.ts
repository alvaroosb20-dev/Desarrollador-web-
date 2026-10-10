'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/admin';
import { sessionClient, serviceClient } from '@/lib/supabase/server';
import { clientIpHash, rateLimit } from '@/lib/request-meta';
import { cleanText, isUuid, validateEmail } from '@/lib/validation';
import { REQUEST_STATUSES, has } from '@/lib/wizard';
import { parseEurosToCents } from '@/lib/format';
import { normalizeWeeklyHours } from '@/lib/slots';
import { isValidTimeZone, parseHm, parseYmd, zonedToUtc } from '@/lib/time';
import { cancelBooking, rescheduleBooking, SlotTakenError } from '@/lib/booking';
import { getBookingSettings } from '@/lib/settings';

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
async function admin() {
  const a = await getAdmin();
  if (!a) redirect('/admin/login?error=no-autorizado');
  return a;
}

function back(path: string, msg: { ok?: string; error?: string }): never {
  const p = new URLSearchParams();
  if (msg.ok) p.set('ok', msg.ok);
  if (msg.error) p.set('error', msg.error);
  redirect(`${path}${path.includes('?') ? '&' : '?'}${p.toString()}`);
}

const str = (fd: FormData, k: string, max = 500) => cleanText(fd.get(k), max);
const bool = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';
const int = (fd: FormData, k: string, min: number, max: number, def: number) => {
  const n = Number(fd.get(k));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};
const lines = (v: string) =>
  v
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);

function revalidatePublic() {
  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------
export async function login(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const email = str(fd, 'email', 254).toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (validateEmail(email) || !password) return { error: 'Introduce tu correo y contraseña.' };
  const ip = await clientIpHash();
  if (!(await rateLimit('admin-login', ip, 8, 900))) return { error: 'Demasiados intentos. Espera 15 minutos.' };

  const supabase = await sessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Correo o contraseña incorrectos.' };
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (isAdmin !== true) {
    await supabase.auth.signOut();
    return { error: 'Esta cuenta no tiene permisos de administración.' };
  }
  redirect('/admin');
}

export async function logout() {
  const supabase = await sessionClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

// ---------------------------------------------------------------------
// Solicitudes
// ---------------------------------------------------------------------
export async function updateRequestStatus(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const status = str(fd, 'status', 40);
  const ret = str(fd, 'return', 300) || `/admin/solicitudes/${id}`;
  if (!isUuid(id) || !has(REQUEST_STATUSES, status)) back(ret, { error: 'Estado no válido.' });
  const { error } = await supabase.from('requests').update({ status }).eq('id', id);
  if (error) back(ret, { error: 'No se pudo cambiar el estado.' });
  revalidatePath('/admin', 'layout');
  back(ret, { ok: 'Estado actualizado.' });
}

export async function addNote(fd: FormData) {
  const { supabase, user } = await admin();
  const id = str(fd, 'request_id', 40);
  const body = str(fd, 'body', 5000);
  if (!isUuid(id)) back('/admin/solicitudes', { error: 'Solicitud no válida.' });
  if (!body) back(`/admin/solicitudes/${id}`, { error: 'La nota está vacía.' });
  const { error } = await supabase.from('private_notes').insert({ request_id: id, author_id: user.id, body });
  if (error) back(`/admin/solicitudes/${id}`, { error: 'No se pudo guardar la nota.' });
  back(`/admin/solicitudes/${id}`, { ok: 'Nota añadida.' });
}

export async function deleteNote(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const rid = str(fd, 'request_id', 40);
  if (isUuid(id)) await supabase.from('private_notes').delete().eq('id', id);
  back(`/admin/solicitudes/${rid}`, { ok: 'Nota eliminada.' });
}

export async function deleteRequest(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  if (str(fd, 'confirm', 20) !== 'ELIMINAR') back(`/admin/solicitudes/${id}`, { error: 'Escribe ELIMINAR para confirmar.' });
  if (!isUuid(id)) back('/admin/solicitudes', { error: 'Solicitud no válida.' });
  const { error } = await supabase.from('requests').delete().eq('id', id);
  if (error) back(`/admin/solicitudes/${id}`, { error: 'No se pudo eliminar.' });
  back('/admin/solicitudes', { ok: 'Solicitud eliminada.' });
}

// ---------------------------------------------------------------------
// Llamadas
// ---------------------------------------------------------------------
export async function setBookingStatus(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const status = str(fd, 'status', 20);
  const ret = str(fd, 'return', 300) || '/admin/llamadas';
  if (!isUuid(id)) back(ret, { error: 'Reserva no válida.' });
  if (status === 'cancelled') {
    try {
      await cancelBooking(id, { byAdmin: true, reason: str(fd, 'reason', 300) || 'Cancelada por el administrador' });
    } catch (e) {
      back(ret, { error: e instanceof Error ? e.message : 'No se pudo cancelar.' });
    }
    back(ret, { ok: 'Llamada cancelada. Se ha avisado al cliente si el correo está configurado.' });
  }
  if (!['confirmed', 'completed'].includes(status)) back(ret, { error: 'Estado no válido.' });
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id).neq('status', 'cancelled');
  if (error) back(ret, { error: 'No se pudo actualizar.' });
  back(ret, { ok: status === 'completed' ? 'Marcada como realizada.' : 'Marcada como pendiente.' });
}

export async function adminReschedule(fd: FormData) {
  await admin();
  const id = str(fd, 'id', 40);
  const date = parseYmd(str(fd, 'date', 10));
  const time = parseHm(str(fd, 'time', 5));
  if (!isUuid(id) || !date || !time) back('/admin/llamadas', { error: 'Fecha u hora no válidas.' });
  const cfg = await getBookingSettings();
  const at = zonedToUtc(date.y, date.m, date.d, time.h, time.min, cfg.timezone);
  if (!at) back('/admin/llamadas', { error: 'Esa hora no existe (cambio de horario).' });
  try {
    await rescheduleBooking(id, at.toISOString(), { byAdmin: true });
  } catch (e) {
    back('/admin/llamadas', {
      error: e instanceof SlotTakenError ? 'Esa hora se solapa con otra llamada.' : e instanceof Error ? e.message : 'No se pudo cambiar.',
    });
  }
  back('/admin/llamadas', { ok: 'Llamada cambiada de hora. Se ha avisado al cliente si el correo está configurado.' });
}

export async function saveAvailability(fd: FormData) {
  const { supabase } = await admin();
  const tz = str(fd, 'timezone', 60);
  if (!isValidTimeZone(tz)) back('/admin/disponibilidad', { error: 'Zona horaria no válida.' });
  const weekly: Record<string, { start: string; end: string }[]> = {};
  for (let d = 1; d <= 7; d++) {
    const ranges: { start: string; end: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const s = str(fd, `d${d}_s${i}`, 5);
      const e = str(fd, `d${d}_e${i}`, 5);
      if (s && e) ranges.push({ start: s, end: e });
    }
    if (bool(fd, `d${d}_on`)) weekly[String(d)] = ranges;
  }
  const clean = normalizeWeeklyHours(weekly);
  const { error } = await supabase
    .from('booking_settings')
    .update({
      enabled: bool(fd, 'enabled'),
      timezone: tz,
      duration_min: int(fd, 'duration_min', 5, 240, 15),
      buffer_min: int(fd, 'buffer_min', 0, 120, 5),
      min_notice_min: int(fd, 'min_notice_hours', 0, 336, 12) * 60,
      max_advance_days: int(fd, 'max_advance_days', 1, 365, 30),
      weekly_hours: clean,
      meeting_details: str(fd, 'meeting_details', 500) || 'Te llamaremos al teléfono que indiques.',
    })
    .eq('id', 1);
  if (error) back('/admin/disponibilidad', { error: 'No se pudo guardar.' });
  revalidatePublic();
  back('/admin/disponibilidad', { ok: 'Disponibilidad guardada.' });
}

export async function addBlock(fd: FormData) {
  const { supabase } = await admin();
  const cfg = await getBookingSettings();
  const kind = str(fd, 'kind', 20);
  const from = parseYmd(str(fd, 'from', 10));
  const to = parseYmd(str(fd, 'to', 10)) ?? from;
  const reason = str(fd, 'reason', 200) || null;
  if (!['holiday', 'vacation', 'block'].includes(kind) || !from || !to) back('/admin/disponibilidad', { error: 'Datos del bloqueo no válidos.' });

  let starts: Date | null;
  let ends: Date | null;
  if (kind === 'block') {
    const ts = parseHm(str(fd, 'start_time', 5));
    const te = parseHm(str(fd, 'end_time', 5));
    if (!ts || !te) back('/admin/disponibilidad', { error: 'Indica la hora de inicio y fin del bloqueo.' });
    starts = zonedToUtc(from.y, from.m, from.d, ts.h, ts.min, cfg.timezone);
    ends = zonedToUtc(from.y, from.m, from.d, te.h, te.min, cfg.timezone);
  } else {
    starts = zonedToUtc(from.y, from.m, from.d, 0, 0, cfg.timezone);
    const end = new Date(Date.UTC(to.y, to.m - 1, to.d + 1));
    ends = zonedToUtc(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), 0, 0, cfg.timezone);
  }
  if (!starts || !ends || ends <= starts) back('/admin/disponibilidad', { error: 'El fin debe ser posterior al inicio.' });
  const { error } = await supabase
    .from('availability_blocks')
    .insert({ kind, starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason });
  if (error) back('/admin/disponibilidad', { error: 'No se pudo guardar el bloqueo.' });
  back('/admin/disponibilidad', { ok: 'Bloqueo añadido. Esas horas ya no se ofrecen.' });
}

export async function deleteBlock(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  if (isUuid(id)) await supabase.from('availability_blocks').delete().eq('id', id);
  back('/admin/disponibilidad', { ok: 'Bloqueo eliminado.' });
}

// ---------------------------------------------------------------------
// Contrataciones
// ---------------------------------------------------------------------
const ORDER_STATUSES = ['awaiting_quote', 'pending_payment', 'payment_setup_pending', 'deposit_paid', 'paid', 'payment_failed', 'cancelled', 'in_progress', 'delivered'];

export async function updateOrderStatus(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const status = str(fd, 'status', 40);
  if (!isUuid(id) || !ORDER_STATUSES.includes(status)) back('/admin/contrataciones', { error: 'Estado no válido.' });
  // "Pagado" solo lo marca el webhook de Stripe; aquí no se puede fingir un cobro.
  if (status === 'paid' || status === 'deposit_paid') {
    back('/admin/contrataciones', {
      error: 'Los estados de pago solo los confirma Stripe. Para pagos fuera de Stripe, registra el cobro con «Registrar pago manual».',
    });
  }
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) back('/admin/contrataciones', { error: 'No se pudo actualizar.' });
  back('/admin/contrataciones', { ok: 'Estado actualizado.' });
}

/** Registro de un cobro recibido fuera de Stripe (transferencia, Bizum…). Queda marcado como manual. */
export async function addManualPayment(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const cents = parseEurosToCents(str(fd, 'amount', 20));
  if (!isUuid(id) || !cents || cents <= 0) back('/admin/contrataciones', { error: 'Importe no válido.' });
  if (str(fd, 'confirm', 10) !== 'on') back('/admin/contrataciones', { error: 'Confirma que el cobro se ha recibido realmente.' });
  const { data: order } = await supabase.from('orders').select('id, total_cents').eq('id', id).single();
  if (!order) back('/admin/contrataciones', { error: 'Pedido no encontrado.' });
  const { error } = await supabase.from('payments').insert({
    order_id: id,
    provider: 'manual',
    kind: 'balance',
    amount_cents: cents,
    status: 'paid',
    paid_at: new Date().toISOString(),
  });
  if (error) back('/admin/contrataciones', { error: 'No se pudo registrar el pago.' });
  const { data: paid } = await supabase.from('payments').select('amount_cents').eq('order_id', id).eq('status', 'paid');
  const total = (paid ?? []).reduce((a: number, p: any) => a + p.amount_cents, 0);
  await supabase.from('orders').update({ status: total >= order.total_cents ? 'paid' : 'deposit_paid' }).eq('id', id);
  back('/admin/contrataciones', { ok: 'Pago manual registrado.' });
}

// ---------------------------------------------------------------------
// Paquetes, mantenimiento y servicios adicionales
// ---------------------------------------------------------------------
export async function savePackage(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const cents = parseEurosToCents(str(fd, 'price', 20));
  const name = str(fd, 'name', 80);
  const slug = str(fd, 'slug', 60).toLowerCase();
  if (!name || cents === null || !/^[a-z0-9-]+$/.test(slug)) back('/admin/paquetes', { error: 'Revisa nombre, precio y URL (solo minúsculas, números y guiones).' });
  const pageLimit = str(fd, 'page_limit', 5);
  const row = {
    name,
    slug,
    price_cents: cents,
    audience: str(fd, 'audience', 300) || null,
    description: str(fd, 'description', 500) || null,
    features: lines(str(fd, 'features', 4000)),
    page_limit: pageLimit ? int(fd, 'page_limit', 1, 999, 1) : null,
    revision_rounds: int(fd, 'revision_rounds', 0, 20, 1),
    badge: str(fd, 'badge', 40) || null,
    highlighted: bool(fd, 'highlighted'),
    cta_label: str(fd, 'cta_label', 60) || null,
    active: bool(fd, 'active'),
    sort: int(fd, 'sort', 0, 999, 0),
  };
  const q = isUuid(id) ? supabase.from('packages').update(row).eq('id', id) : supabase.from('packages').insert(row);
  const { error } = await q;
  if (error) back('/admin/paquetes', { error: error.code === '23505' ? 'Ya existe un paquete con esa URL.' : 'No se pudo guardar.' });
  revalidatePublic();
  back('/admin/paquetes', { ok: `«${name}» guardado. Ya se ve en la web.` });
}

export async function savePlan(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const cents = parseEurosToCents(str(fd, 'price', 20));
  const name = str(fd, 'name', 80);
  const slug = str(fd, 'slug', 60).toLowerCase();
  if (!name || cents === null || !/^[a-z0-9-]+$/.test(slug)) back('/admin/paquetes', { error: 'Revisa nombre, precio y URL del plan.' });
  const row = {
    name,
    slug,
    price_cents: cents,
    price_from: bool(fd, 'price_from'),
    description: str(fd, 'description', 500) || null,
    features: lines(str(fd, 'features', 4000)),
    response_time: str(fd, 'response_time', 300) || null,
    limits: str(fd, 'limits', 500) || null,
    active: bool(fd, 'active'),
    sort: int(fd, 'sort', 0, 999, 0),
  };
  const q = isUuid(id) ? supabase.from('maintenance_plans').update(row).eq('id', id) : supabase.from('maintenance_plans').insert(row);
  const { error } = await q;
  if (error) back('/admin/paquetes', { error: error.code === '23505' ? 'Ya existe un plan con esa URL.' : 'No se pudo guardar.' });
  revalidatePublic();
  back('/admin/paquetes', { ok: `«${name}» guardado.` });
}

export async function saveAddon(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const cents = parseEurosToCents(str(fd, 'price', 20));
  const name = str(fd, 'name', 80);
  const unit = str(fd, 'unit', 20);
  if (!name || cents === null || !['one_time', 'monthly', 'hourly'].includes(unit)) back('/admin/paquetes', { error: 'Revisa el servicio adicional.' });
  const row = {
    name,
    description: str(fd, 'description', 300) || null,
    price_cents: cents,
    unit,
    price_from: bool(fd, 'price_from'),
    active: bool(fd, 'active'),
    sort: int(fd, 'sort', 0, 999, 0),
  };
  const q = isUuid(id) ? supabase.from('addons').update(row).eq('id', id) : supabase.from('addons').insert(row);
  const { error } = await q;
  if (error) back('/admin/paquetes', { error: 'No se pudo guardar.' });
  revalidatePublic();
  back('/admin/paquetes', { ok: `«${name}» guardado.` });
}

export async function deleteCatalogItem(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const table = str(fd, 'table', 30);
  if (!isUuid(id) || !['packages', 'maintenance_plans', 'addons'].includes(table)) back('/admin/paquetes', { error: 'Elemento no válido.' });
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    // Si hay pedidos que lo referencian, mejor desactivarlo
    await supabase.from(table).update({ active: false }).eq('id', id);
    revalidatePublic();
    back('/admin/paquetes', { ok: 'Tiene contrataciones asociadas: se ha desactivado en lugar de eliminarlo.' });
  }
  revalidatePublic();
  back('/admin/paquetes', { ok: 'Eliminado.' });
}

// ---------------------------------------------------------------------
// Ajustes generales
// ---------------------------------------------------------------------
export async function saveSettings(fd: FormData) {
  const { supabase } = await admin();
  const accent = str(fd, 'accent_color', 7);
  const email = str(fd, 'contact_email', 254);
  const legalEmail = str(fd, 'legal_email', 254);
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) back('/admin/ajustes', { error: 'El color debe tener el formato #RRGGBB.' });
  if (email && validateEmail(email)) back('/admin/ajustes', { error: 'El correo de contacto no es válido.' });
  if (legalEmail && validateEmail(legalEmail)) back('/admin/ajustes', { error: 'El correo legal no es válido.' });

  const services = [];
  for (let i = 0; i < 8; i++) {
    const title = str(fd, `svc_title_${i}`, 80);
    if (!title) continue;
    services.push({ key: str(fd, `svc_key_${i}`, 40) || `svc${i}`, title, description: str(fd, `svc_desc_${i}`, 300) });
  }
  const steps = [];
  for (let i = 0; i < 8; i++) {
    const title = str(fd, `step_title_${i}`, 100);
    if (!title) continue;
    steps.push({ title, description: str(fd, `step_desc_${i}`, 300) });
  }

  const { error } = await supabase
    .from('site_settings')
    .update({
      business_name: str(fd, 'business_name', 80) || 'WEBS QUE VENDEN',
      accent_color: accent.toLowerCase(),
      contact_email: email || null,
      whatsapp: str(fd, 'whatsapp', 30) || null,
      hero_title: str(fd, 'hero_title', 160) || 'Tu próxima web puede ser el comienzo de algo grande',
      hero_subtitle: str(fd, 'hero_subtitle', 300) || '',
      pricing_note: str(fd, 'pricing_note', 400) || null,
      footer_text: str(fd, 'footer_text', 300) || null,
      services,
      process_steps: steps,
      legal_owner_name: str(fd, 'legal_owner_name', 160) || null,
      legal_tax_id: str(fd, 'legal_tax_id', 30) || null,
      legal_address: str(fd, 'legal_address', 300) || null,
      legal_email: legalEmail || null,
      legal_registry: str(fd, 'legal_registry', 300) || null,
      terms_version: str(fd, 'terms_version', 20) || '1.0',
      payment_mode: str(fd, 'payment_mode', 10) === 'deposit' ? 'deposit' : 'full',
      deposit_percent: int(fd, 'deposit_percent', 1, 100, 50),
    })
    .eq('id', 1);
  if (error) back('/admin/ajustes', { error: 'No se pudieron guardar los ajustes.' });
  revalidatePublic();
  back('/admin/ajustes', { ok: 'Ajustes guardados. La web pública ya está actualizada.' });
}

const ALLOWED_IMAGES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

async function uploadImage(file: File, folder: string): Promise<string> {
  if (!ALLOWED_IMAGES[file.type]) throw new Error('Formato no permitido (PNG, JPG, WEBP o SVG).');
  if (file.size > 2 * 1024 * 1024) throw new Error('La imagen supera 2 MB.');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ALLOWED_IMAGES[file.type]}`;
  const db = serviceClient();
  const { error } = await db.storage.from('public-assets').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error('No se pudo subir la imagen. ¿Has ejecutado la migración de almacenamiento?');
  return db.storage.from('public-assets').getPublicUrl(path).data.publicUrl;
}

export async function saveLogo(fd: FormData) {
  const { supabase } = await admin();
  if (bool(fd, 'remove')) {
    await supabase.from('site_settings').update({ logo_url: null }).eq('id', 1);
    revalidatePublic();
    back('/admin/ajustes', { ok: 'Logotipo eliminado.' });
  }
  const file = fd.get('logo');
  if (!(file instanceof File) || file.size === 0) back('/admin/ajustes', { error: 'Elige una imagen.' });
  let url: string;
  try {
    url = await uploadImage(file, 'logo');
  } catch (e) {
    back('/admin/ajustes', { error: e instanceof Error ? e.message : 'Error al subir.' });
  }
  await supabase.from('site_settings').update({ logo_url: url }).eq('id', 1);
  revalidatePublic();
  back('/admin/ajustes', { ok: 'Logotipo actualizado.' });
}

// ---------------------------------------------------------------------
// Contenido: preguntas frecuentes y proyectos de demostración
// ---------------------------------------------------------------------
export async function saveFaq(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const question = str(fd, 'question', 300);
  const answer = str(fd, 'answer', 3000);
  if (!question || !answer) back('/admin/contenido', { error: 'Escribe la pregunta y la respuesta.' });
  const row = { question, answer, active: bool(fd, 'active'), sort: int(fd, 'sort', 0, 999, 0) };
  const { error } = isUuid(id) ? await supabase.from('faqs').update(row).eq('id', id) : await supabase.from('faqs').insert(row);
  if (error) back('/admin/contenido', { error: 'No se pudo guardar.' });
  revalidatePublic();
  back('/admin/contenido', { ok: 'Pregunta guardada.' });
}

export async function saveDemo(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const title = str(fd, 'title', 80);
  const sector = str(fd, 'sector', 80);
  if (!title || !sector) back('/admin/contenido', { error: 'Escribe título y sector.' });
  const color = (k: string, d: string) => (/^#[0-9a-fA-F]{6}$/.test(str(fd, k, 7)) ? str(fd, k, 7) : d);
  const row: Record<string, unknown> = {
    title,
    sector,
    description: str(fd, 'description', 300) || null,
    layout: str(fd, 'layout', 30) || 'generic',
    palette: { bg: color('bg', '#111111'), fg: color('fg', '#f5f5f5'), accent: color('accent', '#c8f26d') },
    active: bool(fd, 'active'),
    sort: int(fd, 'sort', 0, 999, 0),
  };
  const file = fd.get('image');
  if (file instanceof File && file.size > 0) {
    try {
      row.image_url = await uploadImage(file, 'demos');
    } catch (e) {
      back('/admin/contenido', { error: e instanceof Error ? e.message : 'Error al subir.' });
    }
  }
  if (bool(fd, 'remove_image')) row.image_url = null;
  const { error } = isUuid(id) ? await supabase.from('demo_projects').update(row).eq('id', id) : await supabase.from('demo_projects').insert(row);
  if (error) back('/admin/contenido', { error: 'No se pudo guardar.' });
  revalidatePublic();
  back('/admin/contenido', { ok: 'Proyecto de demostración guardado.' });
}

export async function deleteContent(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, 'id', 40);
  const table = str(fd, 'table', 30);
  if (!isUuid(id) || !['faqs', 'demo_projects'].includes(table)) back('/admin/contenido', { error: 'Elemento no válido.' });
  await supabase.from(table).delete().eq('id', id);
  revalidatePublic();
  back('/admin/contenido', { ok: 'Eliminado.' });
}
