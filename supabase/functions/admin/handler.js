// POST /functions/v1/admin  (solo administradores; se comprueba la sesión en el servidor)
//   { action: 'status' }                               → estado de las integraciones
//   { action: 'test_email' }                           → envía un correo de prueba al administrador
//   { action: 'reschedule', id, date: 'YYYY-MM-DD', time: 'HH:MM' }
//   { action: 'cancel', id, reason }
import { env, fail, handler, json, readJson, siteUrl } from '../_shared/http.js';
import { selectOne } from '../_shared/db.js';
import { BookingError, cancelBooking, rescheduleBooking } from '../_shared/booking.js';
import { getBookingSettings } from '../_shared/settings.js';
import { parseHm, parseYmd, zonedToUtc } from '../_shared/time.js';
import { adminEmailConfigured, emailConfigured, notifyAdmin } from '../_shared/email.js';
import { stripeConfigured, stripeTestMode } from '../_shared/stripe.js';
import { cleanText, isUuid } from '../_shared/wizard.js';

/** Devuelve el id del usuario si el token es de un administrador; si no, null. */
async function requireAdmin(req) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || token.split('.').length !== 3) return null;
  const url = env('SUPABASE_URL').replace(/\/+$/, '');
  const key = env('SUPABASE_ANON_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  if (!isUuid(user?.id)) return null;
  const { data } = await selectOne('admins', `select=user_id&user_id=eq.${user.id}`);
  return data ? user.id : null;
}

export default handler(async (req) => {
  const adminId = await requireAdmin(req);
  if (!adminId) return fail(req, 'No autorizado.', 401);
  const body = await readJson(req);
  if (!body) return fail(req, 'Solicitud no válida.');

  try {
    switch (body.action) {
      case 'status':
        return json(req, {
          ok: true,
          integrations: {
            database: true,
            siteUrl: Boolean(env('SITE_URL')),
            siteUrlValue: siteUrl(),
            leadSecret: env('LEAD_SECRET').length >= 32,
            email: emailConfigured(),
            adminEmail: adminEmailConfigured(),
            stripe: stripeConfigured(),
            stripeTestMode: stripeTestMode(),
            webhookUrl: `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/stripe-webhook`,
          },
        });
      case 'test_email': {
        const r = await notifyAdmin('Correo de prueba', [['Resultado', 'Si lees esto, los avisos por correo funcionan.']], `${siteUrl()}/admin.html`);
        return json(req, { ok: r === 'sent', result: r });
      }
      case 'reschedule': {
        const id = cleanText(body.id, 40);
        const date = parseYmd(cleanText(body.date, 10));
        const time = parseHm(cleanText(body.time, 5));
        if (!isUuid(id) || !date || !time) return fail(req, 'Fecha u hora no válidas.');
        const cfg = await getBookingSettings();
        const at = zonedToUtc(date.y, date.m, date.d, time.h, time.min, cfg.timezone);
        if (!at) return fail(req, 'Esa hora no existe (cambio de horario).');
        const r = await rescheduleBooking(id, at.toISOString(), { byAdmin: true });
        return json(req, { ok: true, emailStatus: r.emailStatus });
      }
      case 'cancel': {
        const id = cleanText(body.id, 40);
        if (!isUuid(id)) return fail(req, 'Reserva no válida.');
        const r = await cancelBooking(id, { byAdmin: true, reason: cleanText(body.reason, 300) || 'Cancelada por el administrador' });
        return json(req, { ok: true, emailStatus: r.emailStatus });
      }
      default:
        return fail(req, 'Acción no válida.');
    }
  } catch (e) {
    if (e instanceof BookingError) return fail(req, e.message, e.status);
    throw e;
  }
});
