// GET  /functions/v1/booking?from=YYYY-MM-DD&to=YYYY-MM-DD[&token=…]  → SOLO huecos libres
// POST /functions/v1/booking { action: 'create' | 'lookup' | 'cancel' | 'reschedule', … }
import { env, fail, handler, ipHash, json, looksLikeBot, rateLimit, readJson } from '../_shared/http.js';
import { verifyLead } from '../_shared/crypto.js';
import { getBookingSettings } from '../_shared/settings.js';
import { addDays, isValidTimeZone, parseYmd, ymdToString } from '../_shared/time.js';
import {
  BookingError,
  availableSlots,
  cancelBooking,
  createBooking,
  defaultRange,
  findBookingByToken,
  rescheduleBooking,
} from '../_shared/booking.js';
import { cleanText, normalizePhone, validateEmail, validateName, validatePhone } from '../_shared/wizard.js';

async function slots(req) {
  const url = new URL(req.url);
  const cfg = await getBookingSettings();
  const def = defaultRange(cfg);
  const from = parseYmd(url.searchParams.get('from')) ?? def.from;
  let to = parseYmd(url.searchParams.get('to')) ?? def.to;
  if (ymdToString(to) > ymdToString(addDays(from, 62))) to = addDays(from, 62);

  // Al cambiar una cita, su hueco actual cuenta como libre.
  let excludeId;
  const token = url.searchParams.get('token');
  if (token) {
    const b = await findBookingByToken(token);
    if (b && b.status === 'confirmed') excludeId = b.id;
  }
  const { days } = await availableSlots(from, to, excludeId);
  return json(req, {
    ok: true,
    enabled: cfg.enabled,
    timezone: cfg.timezone,
    durationMin: cfg.duration_min,
    meetingDetails: cfg.meeting_details,
    days: days.filter((d) => d.slots.length > 0),
  });
}

async function create(req, body) {
  if (looksLikeBot(body, 3000)) return fail(req, 'No hemos podido verificar la reserva. Inténtalo de nuevo.');
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = normalizePhone(cleanText(body.phone, 30));
  const summary = cleanText(body.summary, 1000);
  const start = cleanText(body.start, 40);
  const tz = cleanText(body.timezone, 60);

  const e1 = validateName(name);
  if (e1) return fail(req, e1, 400, 'name');
  const e2 = validateEmail(email);
  if (e2) return fail(req, e2, 400, 'email');
  const e3 = validatePhone(phone);
  if (e3) return fail(req, e3, 400, 'phone');
  if (body.privacy !== true) return fail(req, 'Debes aceptar la política de privacidad.', 400, 'privacy');
  if (!start || Number.isNaN(Date.parse(start))) return fail(req, 'Elige un día y una hora.', 400, 'start');

  const ip = await ipHash(req);
  if (!(await rateLimit('booking', ip, 6, 3600))) {
    return fail(req, 'Has hecho varias reservas seguidas. Espera un poco o escríbenos.', 429);
  }

  // ¿Viene de completar el formulario? → la reserva se vincula a su solicitud.
  const requestId = await verifyLead(env('LEAD_SECRET'), cleanText(body.leadToken, 200));

  const booking = await createBooking({
    requestId,
    startIso: new Date(start).toISOString(),
    name,
    email,
    phone: phone || null,
    summary,
    visitorTz: tz && isValidTimeZone(tz) ? tz : null,
  });
  return json(req, {
    ok: true,
    booking: {
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      timezone: booking.timezone,
      emailStatus: booking.emailStatus,
      manageToken: booking.token,
    },
  });
}

async function manage(req, body) {
  const ip = await ipHash(req);
  if (!(await rateLimit('manage', ip, 30, 3600))) return fail(req, 'Demasiados intentos. Espera un poco.', 429);
  const token = cleanText(body.token, 64);
  const booking = await findBookingByToken(token);
  if (!booking) return fail(req, 'El enlace no es válido o ha caducado.', 404);

  if (body.action === 'lookup') {
    return json(req, {
      ok: true,
      booking: {
        status: booking.status,
        name: booking.name,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        businessTimezone: booking.business_timezone,
        visitorTimezone: booking.visitor_timezone,
        canReschedule: booking.status === 'confirmed' && (booking.reschedule_count ?? 0) < 3 && new Date(booking.starts_at) > new Date(),
      },
    });
  }
  if (booking.status !== 'confirmed') return fail(req, 'Esta cita ya no está activa.');
  if (body.action === 'cancel') {
    const r = await cancelBooking(booking.id, { reason: cleanText(body.reason, 500) });
    return json(req, { ok: true, emailStatus: r.emailStatus });
  }
  if (body.action === 'reschedule') {
    const start = cleanText(body.start, 40);
    if (!start || Number.isNaN(Date.parse(start))) return fail(req, 'Elige un nuevo horario.');
    if ((booking.reschedule_count ?? 0) >= 3) {
      return fail(req, 'Has cambiado esta cita varias veces. Escríbenos para buscar otro momento.');
    }
    const r = await rescheduleBooking(booking.id, new Date(start).toISOString(), { token });
    return json(req, { ok: true, startsAt: r.starts_at, emailStatus: r.emailStatus });
  }
  return fail(req, 'Acción no válida.');
}

export default handler(
  async (req) => {
    try {
      if (req.method === 'GET') return await slots(req);
      const body = await readJson(req);
      if (!body) return fail(req, 'Solicitud no válida.');
      if (body.action === 'create') return await create(req, body);
      if (['lookup', 'cancel', 'reschedule'].includes(body.action)) return await manage(req, body);
      return fail(req, 'Acción no válida.');
    } catch (e) {
      if (e instanceof BookingError) return fail(req, e.message, e.status, e.status === 409 ? 'start' : undefined);
      console.error('booking error', e);
      return fail(req, 'No hemos podido completar la operación. Inténtalo de nuevo.', 500);
    }
  },
  { methods: ['GET', 'POST'] },
);
