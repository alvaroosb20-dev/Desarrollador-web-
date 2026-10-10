// Lógica de reservas en el servidor.
import { must, q, rpc, select, selectOne, update } from './db.js';
import { computeSlots, isSlotAvailable } from './slots.js';
import { addDays, formatDateTime, todayIn } from './time.js';
import { getBookingSettings, getSettings } from './settings.js';
import { randomToken, sha256Hex } from './crypto.js';
import { notifyAdmin, sendBookingEmail } from './email.js';
import { siteUrl } from './http.js';

export class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const SLOT_TAKEN = 'Ese horario acaba de ocuparse. Elige otro, por favor.';

/** Rangos ocupados (reservas activas + bloqueos) en una ventana UTC. */
export async function loadBusy(from, to, excludeBookingId) {
  const f = q(from.toISOString());
  const t = q(to.toISOString());
  let bq = `select=id,starts_at,blocked_until&status=neq.cancelled&starts_at=lt.${t}&blocked_until=gt.${f}`;
  if (excludeBookingId) bq += `&id=neq.${excludeBookingId}`;
  const [b, k] = await Promise.all([
    select('bookings', bq),
    select('availability_blocks', `select=starts_at,ends_at&starts_at=lt.${t}&ends_at=gt.${f}`),
  ]);
  must(b, 'disponibilidad');
  must(k, 'bloqueos');
  return [
    ...b.data.map((x) => ({ start: new Date(x.starts_at), end: new Date(x.blocked_until) })),
    ...k.data.map((x) => ({ start: new Date(x.starts_at), end: new Date(x.ends_at) })),
  ];
}

export async function availableSlots(from, to, excludeBookingId) {
  const cfg = await getBookingSettings();
  if (!cfg.enabled) return { cfg, days: [] };
  const windowFrom = new Date(Date.UTC(from.y, from.m - 1, from.d) - 2 * 86400000);
  const windowTo = new Date(Date.UTC(to.y, to.m - 1, to.d) + 3 * 86400000);
  const busy = await loadBusy(windowFrom, windowTo, excludeBookingId);
  return { cfg, days: computeSlots(cfg, busy, from, to) };
}

export function defaultRange(cfg) {
  const from = todayIn(cfg.timezone);
  return { from, to: addDays(from, Math.min(cfg.max_advance_days, 62)) };
}

async function assertSlot(cfg, startIso, excludeId) {
  const start = new Date(startIso);
  const busy = await loadBusy(new Date(start.getTime() - 2 * 86400000), new Date(start.getTime() + 2 * 86400000), excludeId);
  if (!isSlotAvailable(cfg, busy, startIso)) throw new BookingError(SLOT_TAKEN, 409);
  return times(cfg, start);
}

function times(cfg, start) {
  return {
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + cfg.duration_min * 60000).toISOString(),
    blocked_until: new Date(start.getTime() + (cfg.duration_min + cfg.buffer_min) * 60000).toISOString(),
  };
}

export async function createBooking(input) {
  const cfg = await getBookingSettings();
  if (!cfg.enabled) throw new BookingError('Las reservas online no están activas ahora mismo.', 503);
  const t = await assertSlot(cfg, input.startIso);
  const token = randomToken(24);
  const { data, error } = await rpc('create_booking_record', {
    p: {
      ...t,
      request_id: input.requestId ?? '',
      business_timezone: cfg.timezone,
      visitor_timezone: input.visitorTz ?? '',
      name: input.name,
      email: input.email,
      phone: input.phone ?? '',
      summary: input.summary ?? '',
      manage_token_hash: await sha256Hex(token),
    },
  });
  if (error) {
    if (/slot_taken/.test(error.message)) throw new BookingError(SLOT_TAKEN, 409);
    if (/too_many_bookings/.test(error.message)) {
      throw new BookingError('Ya tienes citas pendientes con nosotros. Puedes cambiarlas desde el enlace del correo de confirmación.');
    }
    throw new Error(`No se pudo guardar la reserva: ${error.message}`);
  }

  const settings = await getSettings();
  const emailStatus = await sendBookingEmail('confirmed', {
    bookingId: data.booking_id,
    brand: settings.business_name,
    name: input.name,
    email: input.email,
    startsAt: t.starts_at,
    endsAt: t.ends_at,
    businessTz: cfg.timezone,
    visitorTz: input.visitorTz,
    meetingDetails: cfg.meeting_details,
    manageToken: token,
    replyTo: settings.contact_email,
  });
  const adminStatus = await notifyAdmin(
    'Nueva llamada agendada',
    [
      ['Fecha', formatDateTime(t.starts_at, cfg.timezone)],
      ['Nombre', input.name],
      ['Correo', input.email],
      ['Teléfono', input.phone || '—'],
      ['Proyecto', input.summary || '—'],
      ['Vinculada a una solicitud', data.request_id ? 'Sí' : 'No (contacto nuevo)'],
    ],
    `${siteUrl()}/admin.html#/llamadas`,
  );
  await update('bookings', `id=eq.${data.booking_id}`, { email_status: emailStatus, admin_email_status: adminStatus });
  return { id: data.booking_id, startsAt: t.starts_at, endsAt: t.ends_at, token, emailStatus, timezone: cfg.timezone, linked: Boolean(data.request_id) };
}

export async function findBookingByToken(token) {
  if (!/^[0-9a-f]{48}$/.test(String(token ?? ''))) return null;
  const { data } = await selectOne(
    'bookings',
    `select=id,starts_at,ends_at,status,name,email,business_timezone,visitor_timezone,reschedule_count&manage_token_hash=eq.${await sha256Hex(token)}`,
  );
  return data;
}

async function loadBooking(id) {
  const { data } = await selectOne('bookings', `select=*&id=eq.${id}`);
  return data;
}

/** Cambia la hora de una cita. El administrador puede saltarse la antelación mínima y los horarios. */
export async function rescheduleBooking(bookingId, startIso, { token, byAdmin = false } = {}) {
  const cfg = await getBookingSettings();
  const current = await loadBooking(bookingId);
  if (!current || current.status !== 'confirmed') throw new BookingError('Esta cita ya no se puede modificar.');
  let t;
  if (byAdmin) {
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) throw new BookingError('Fecha no válida.');
    t = times(cfg, start);
  } else {
    if (new Date(current.starts_at).getTime() <= Date.now()) throw new BookingError('La cita ya ha pasado.');
    t = await assertSlot({ ...cfg, enabled: true }, startIso, bookingId);
  }
  const newToken = token ?? randomToken(24);
  const { error } = await update('bookings', `id=eq.${bookingId}&status=eq.confirmed`, {
    ...t,
    reschedule_count: (current.reschedule_count ?? 0) + 1,
    ...(token ? {} : { manage_token_hash: await sha256Hex(newToken) }),
  });
  if (error) {
    if (error.code === '23P01') throw new BookingError(byAdmin ? 'Esa hora se solapa con otra llamada.' : SLOT_TAKEN, 409);
    throw new Error(`No se pudo cambiar la cita: ${error.message}`);
  }
  const settings = await getSettings();
  const emailStatus = await sendBookingEmail('rescheduled', {
    bookingId,
    brand: settings.business_name,
    name: current.name,
    email: current.email,
    startsAt: t.starts_at,
    endsAt: t.ends_at,
    businessTz: current.business_timezone,
    visitorTz: current.visitor_timezone,
    meetingDetails: cfg.meeting_details,
    manageToken: newToken,
    replyTo: settings.contact_email,
    sequence: (current.reschedule_count ?? 0) + 1,
  });
  if (!byAdmin) {
    await notifyAdmin(
      'Una llamada ha cambiado de hora',
      [
        ['Nombre', current.name],
        ['Antes', formatDateTime(current.starts_at, current.business_timezone)],
        ['Ahora', formatDateTime(t.starts_at, current.business_timezone)],
      ],
      `${siteUrl()}/admin.html#/llamadas`,
    );
  }
  await update('bookings', `id=eq.${bookingId}`, { email_status: emailStatus });
  return { ...t, emailStatus };
}

export async function cancelBooking(bookingId, { reason, byAdmin = false } = {}) {
  const current = await loadBooking(bookingId);
  if (!current || current.status !== 'confirmed') throw new BookingError('Esta cita ya no está activa.');
  const { error } = await update('bookings', `id=eq.${bookingId}&status=eq.confirmed`, {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancel_reason: reason || null,
  });
  if (error) throw new Error('No se pudo cancelar la cita.');
  const [settings, cfg] = await Promise.all([getSettings(), getBookingSettings()]);
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
    manageToken: '',
    replyTo: settings.contact_email,
    sequence: (current.reschedule_count ?? 0) + 1,
  });
  if (!byAdmin) {
    await notifyAdmin(
      'Una llamada se ha cancelado',
      [
        ['Nombre', current.name],
        ['Fecha', formatDateTime(current.starts_at, current.business_timezone)],
        ['Motivo', reason || '—'],
      ],
      `${siteUrl()}/admin.html#/llamadas`,
    );
  }
  await update('bookings', `id=eq.${bookingId}`, { email_status: emailStatus });
  return { emailStatus };
}
