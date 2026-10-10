// GET /functions/v1/calendar-feed?key=<clave privada>
// Calendario suscribible (formato iCalendar) con las llamadas agendadas.
// Se añade en Google Calendar → «Otros calendarios» → «Desde URL», o en Apple/Outlook.
// La clave está en el panel (Integraciones) y se puede regenerar en cualquier momento.
import { select, selectOne, q } from '../_shared/db.js';
import { safeEqual } from '../_shared/crypto.js';
import { icsCalendar, icsEvent } from '../_shared/email.js';
import { getSettings } from '../_shared/settings.js';
import { siteUrl } from '../_shared/http.js';

export default async function feed(req) {
  if (req.method !== 'GET') return new Response('Método no permitido', { status: 405 });
  const key = new URL(req.url).searchParams.get('key') ?? '';
  const { data: priv } = await selectOne('private_settings', 'select=calendar_feed_key&id=eq.1');
  if (!priv?.calendar_feed_key || !safeEqual(key, priv.calendar_feed_key)) {
    return new Response('No autorizado', { status: 401 });
  }
  const from = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: rows, error } = await select(
    'bookings',
    `select=id,starts_at,ends_at,status,name,email,phone,project_summary,reschedule_count&starts_at=gte.${q(from)}&order=starts_at.asc&limit=1000`,
  );
  if (error) return new Response('Error', { status: 500 });
  const settings = await getSettings();
  const events = (rows ?? []).map((b) =>
    icsEvent({
      uid: `${b.id}@webs-que-venden`,
      start: new Date(b.starts_at),
      end: new Date(b.ends_at),
      title: `${b.status === 'cancelled' ? '[Cancelada] ' : ''}Llamada: ${b.name}`,
      description: [
        `Correo: ${b.email}`,
        `Teléfono: ${b.phone || '—'}`,
        `Proyecto: ${b.project_summary || '—'}`,
        `Panel: ${siteUrl()}/admin.html#/llamadas`,
      ].join('\n'),
      sequence: b.reschedule_count ?? 0,
      status: b.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
    }),
  );
  return new Response(icsCalendar(events, { name: `Llamadas · ${settings.business_name}` }), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
