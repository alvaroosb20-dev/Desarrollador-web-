import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeSlots, isSlotAvailable, type BusyRange, type DaySlots } from './slots';
import { getBookingSettings, getSettings, type BookingSettings } from './settings';
import { serviceClient } from './supabase/server';
import { addDays, todayIn, type YMD } from './time';
import { randomToken, sha256Hex } from './lead-cookie';
import { notifyAdmin, sendBookingEmail } from './email';
import { siteUrl } from './env';
import { formatDateTime } from './time';

/** Rangos ocupados (reservas activas + bloqueos) en una ventana UTC. */
export async function loadBusy(db: SupabaseClient, from: Date, to: Date, excludeBookingId?: string): Promise<BusyRange[]> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  let q = db
    .from('bookings')
    .select('id, starts_at, blocked_until')
    .neq('status', 'cancelled')
    .lt('starts_at', toIso)
    .gt('blocked_until', fromIso);
  if (excludeBookingId) q = q.neq('id', excludeBookingId);
  const [{ data: bookings, error: e1 }, { data: blocks, error: e2 }] = await Promise.all([
    q,
    db.from('availability_blocks').select('starts_at, ends_at').lt('starts_at', toIso).gt('ends_at', fromIso),
  ]);
  if (e1 || e2) throw new Error('No se pudo consultar la disponibilidad');
  return [
    ...(bookings ?? []).map((b: any) => ({ start: new Date(b.starts_at), end: new Date(b.blocked_until) })),
    ...(blocks ?? []).map((b: any) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) })),
  ];
}

export async function getAvailableSlots(
  from: YMD,
  to: YMD,
  excludeBookingId?: string,
): Promise<{ cfg: BookingSettings; days: DaySlots[] }> {
  const cfg = await getBookingSettings();
  if (!cfg.enabled) return { cfg, days: [] };
  const db = serviceClient();
  // margen de 2 días a cada lado para cubrir cualquier zona horaria
  const windowFrom = new Date(Date.UTC(from.y, from.m - 1, from.d) - 2 * 86400000);
  const windowTo = new Date(Date.UTC(to.y, to.m - 1, to.d) + 3 * 86400000);
  const busy = await loadBusy(db, windowFrom, windowTo, excludeBookingId);
  return { cfg, days: computeSlots(cfg, busy, from, to) };
}

export function defaultRange(cfg: BookingSettings): { from: YMD; to: YMD } {
  const from = todayIn(cfg.timezone);
  return { from, to: addDays(from, Math.min(cfg.max_advance_days, 62)) };
}

export class SlotTakenError extends Error {
  constructor() {
    super('Ese horario acaba de ocuparse. Elige otro, por favor.');
  }
}

async function assertSlot(db: SupabaseClient, cfg: BookingSettings, startIso: string, excludeId?: string) {
  const start = new Date(startIso);
  const busy = await loadBusy(db, new Date(start.getTime() - 2 * 86400000), new Date(start.getTime() + 2 * 86400000), excludeId);
  if (!isSlotAvailable(cfg, busy, startIso)) throw new SlotTakenError();
  return {
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + cfg.duration_min * 60000).toISOString(),
    blocked_until: new Date(start.getTime() + (cfg.duration_min + cfg.buffer_min) * 60000).toISOString(),
  };
}

export async function createBooking(input: {
  contactId: string;
  requestId: string | null;
  startIso: string;
  name: string;
  email: string;
  phone: string | null;
  summary: string;
  visitorTz: string | null;
}) {
  const db = serviceClient();
  const cfg = await getBookingSettings();
  if (!cfg.enabled) throw new Error('Las reservas online no están activas ahora mismo.');
  const times = await assertSlot(db, cfg, input.startIso);
  const token = randomToken(24);
  const { data, error } = await db
    .from('bookings')
    .insert({
      contact_id: input.contactId,
      request_id: input.requestId,
      ...times,
      business_timezone: cfg.timezone,
      visitor_timezone: input.visitorTz,
      name: input.name,
      email: input.email,
      phone: input.phone,
      project_summary: input.summary || null,
      status: 'confirmed',
      manage_token_hash: await sha256Hex(token),
    })
    .select('id, starts_at, ends_at')
    .single();

  if (error) {
    if (error.code === '23P01') throw new SlotTakenError(); // restricción anti-solapamiento
    throw new Error(`No se pudo guardar la reserva: ${error.message}`);
  }

  const settings = await getSettings();
  const emailStatus = await sendBookingEmail('confirmed', {
    bookingId: data.id,
    brand: settings.business_name,
    name: input.name,
    email: input.email,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    businessTz: cfg.timezone,
    visitorTz: input.visitorTz,
    meetingDetails: cfg.meeting_details,
    manageToken: token,
    replyTo: settings.contact_email,
  });
  const adminStatus = await notifyAdmin(
    'Nueva llamada agendada',
    [
      ['Fecha', formatDateTime(data.starts_at, cfg.timezone)],
      ['Nombre', input.name],
      ['Correo', input.email],
      ['Teléfono', input.phone || '—'],
      ['Proyecto', input.summary || '—'],
      ['Vinculada a solicitud', input.requestId ? 'Sí' : 'No'],
    ],
    `${siteUrl()}/admin/llamadas`,
  );
  await db.from('bookings').update({ email_status: emailStatus, admin_email_status: adminStatus }).eq('id', data.id);

  return { id: data.id as string, startsAt: data.starts_at as string, endsAt: data.ends_at as string, token, emailStatus, timezone: cfg.timezone };
}

export async function findBookingByToken(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const db = serviceClient();
  const { data } = await db
    .from('bookings')
    .select('id, starts_at, ends_at, status, name, email, business_timezone, visitor_timezone, reschedule_count')
    .eq('manage_token_hash', await sha256Hex(token))
    .maybeSingle();
  return data;
}

/** Cambia la hora de una reserva. `byAdmin` permite saltarse la antelación mínima. */
export async function rescheduleBooking(bookingId: string, startIso: string, opts: { token?: string; byAdmin?: boolean } = {}) {
  const db = serviceClient();
  const cfg = await getBookingSettings();
  const { data: current } = await db.from('bookings').select('*').eq('id', bookingId).single();
  if (!current || current.status !== 'confirmed') throw new Error('Esta cita ya no se puede modificar.');

  let times;
  if (opts.byAdmin) {
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) throw new Error('Fecha no válida.');
    times = {
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + cfg.duration_min * 60000).toISOString(),
      blocked_until: new Date(start.getTime() + (cfg.duration_min + cfg.buffer_min) * 60000).toISOString(),
    };
  } else {
    if (new Date(current.starts_at).getTime() <= Date.now()) throw new Error('La cita ya ha pasado.');
    times = await assertSlot(db, { ...cfg, enabled: true }, startIso, bookingId);
  }

  const { error } = await db
    .from('bookings')
    .update({ ...times, reschedule_count: (current.reschedule_count ?? 0) + 1 })
    .eq('id', bookingId)
    .eq('status', 'confirmed');
  if (error) {
    if (error.code === '23P01') throw new SlotTakenError();
    throw new Error('No se pudo cambiar la cita.');
  }

  // Nuevo enlace de gestión para el correo (el anterior deja de funcionar)
  const token = opts.token ?? randomToken(24);
  if (!opts.token) await db.from('bookings').update({ manage_token_hash: await sha256Hex(token) }).eq('id', bookingId);

  const settings = await getSettings();
  const emailStatus = await sendBookingEmail('rescheduled', {
    bookingId,
    brand: settings.business_name,
    name: current.name,
    email: current.email,
    startsAt: times.starts_at,
    endsAt: times.ends_at,
    businessTz: current.business_timezone,
    visitorTz: current.visitor_timezone,
    meetingDetails: cfg.meeting_details,
    manageToken: token,
    replyTo: settings.contact_email,
    sequence: (current.reschedule_count ?? 0) + 1,
  });
  if (!opts.byAdmin) {
    await notifyAdmin(
      'Una llamada ha cambiado de hora',
      [
        ['Nombre', current.name],
        ['Antes', formatDateTime(current.starts_at, current.business_timezone)],
        ['Ahora', formatDateTime(times.starts_at, current.business_timezone)],
      ],
      `${siteUrl()}/admin/llamadas`,
    );
  }
  await db.from('bookings').update({ email_status: emailStatus }).eq('id', bookingId);
  return { ...times, emailStatus };
}

export async function cancelBooking(bookingId: string, opts: { reason?: string; byAdmin?: boolean; token?: string } = {}) {
  const db = serviceClient();
  const { data: current } = await db.from('bookings').select('*').eq('id', bookingId).single();
  if (!current || current.status !== 'confirmed') throw new Error('Esta cita ya no está activa.');
  const { error } = await db
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: opts.reason || null })
    .eq('id', bookingId);
  if (error) throw new Error('No se pudo cancelar la cita.');

  const settings = await getSettings();
  const cfg = await getBookingSettings();
  const emailStatus = await sendBookingEmail('cancelled', {
    bookingId,
    brand: settings.business_name,
    name: current.name,
    email: current.email,
    startsAt: current.starts_at,
    endsAt: current.ends_at,
    businessTz: current.business_timezone,
    visitorTz: current.visitor_timezone,
    meetingDetails: cfg.meeting_details,
    manageToken: opts.token ?? '',
    replyTo: settings.contact_email,
    sequence: (current.reschedule_count ?? 0) + 1,
  });
  if (!opts.byAdmin) {
    await notifyAdmin(
      'Una llamada se ha cancelado',
      [
        ['Nombre', current.name],
        ['Fecha', formatDateTime(current.starts_at, current.business_timezone)],
        ['Motivo', opts.reason || '—'],
      ],
      `${siteUrl()}/admin/llamadas`,
    );
  }
  return { emailStatus };
}
