// Correo con Resend (https://resend.com). Si no está configurado, NUNCA finge el envío:
// devuelve 'not_configured' y el panel lo muestra.
import { env, siteUrl } from './http.js';
import { escapeHtml } from './format.js';
import { formatDateTime, tzLabel } from './time.js';
import { base64 } from './crypto.js';

export const emailConfigured = () => Boolean(env('RESEND_API_KEY') && env('EMAIL_FROM'));
export const adminEmailConfigured = () => Boolean(emailConfigured() && env('ADMIN_NOTIFY_EMAIL'));

/** @returns {Promise<'sent'|'failed'|'not_configured'>} */
export async function sendEmail({ to, subject, html, text, replyTo, attachments }) {
  if (!emailConfigured()) return 'not_configured';
  try {
    const res = await fetch(`${env('RESEND_API_BASE') || 'https://api.resend.com'}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env('EMAIL_FROM'),
        to: [to],
        subject,
        html,
        text,
        reply_to: replyTo || undefined,
        attachments,
      }),
    });
    if (!res.ok) {
      console.error('Resend error', res.status, await res.text().catch(() => ''));
      return 'failed';
    }
    return 'sent';
  } catch (e) {
    console.error('Resend exception', e);
    return 'failed';
  }
}

function button(label, href, secondary = false) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:16px 8px 0 0;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;${
    secondary ? 'background:#f1f1f1;color:#111' : 'background:#111;color:#fff'
  }">${escapeHtml(label)}</a>`;
}

function layout(title, body, brand) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#777;margin-bottom:12px">${escapeHtml(brand)}</div>
<div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #e7e5e4">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
</div></div></body></html>`;
}

export async function notifyAdmin(subject, lines, link) {
  if (!adminEmailConfigured()) return 'not_configured';
  const rows = lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');
  const html = layout(subject, `<table style="border-collapse:collapse;font-size:14px">${rows}</table>${link ? button('Abrir en el panel', link) : ''}`, 'Aviso interno');
  const text = `${subject}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}${link ? `\n\n${link}` : ''}`;
  return sendEmail({ to: env('ADMIN_NOTIFY_EMAIL'), subject, html, text });
}

const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEscape = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function icsEvent({ uid, start, end, title, description, method = 'PUBLISH', sequence = 0, status }) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `STATUS:${status ?? (method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED')}`,
    'END:VEVENT',
  ];
}

export function icsCalendar(events, { method = 'PUBLISH', name } = {}) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//webs-que-venden//reservas//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    ...(name ? [`X-WR-CALNAME:${icsEscape(name)}`] : []),
    ...events.flat(),
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Enlace de gestión de la cita. El token va en el fragmento (#): no llega a ningún servidor ni a los registros. */
export const manageUrl = (token) => `${siteUrl()}/cita.html#t=${token}`;

export async function sendBookingEmail(kind, b) {
  const tz = b.visitorTz || b.businessTz;
  const when = formatDateTime(b.startsAt, tz);
  const link = manageUrl(b.manageToken);
  const titles = {
    confirmed: 'Tu llamada está reservada',
    rescheduled: 'Hemos cambiado la hora de tu llamada',
    cancelled: 'Tu llamada se ha cancelado',
  };
  const title = titles[kind];
  const tzNote =
    tz !== b.businessTz
      ? `<p style="color:#666;font-size:13px;margin:4px 0 0">Hora en tu zona: ${escapeHtml(tzLabel(tz))}. En nuestra zona (${escapeHtml(
          tzLabel(b.businessTz),
        )}) es ${escapeHtml(formatDateTime(b.startsAt, b.businessTz))}.</p>`
      : `<p style="color:#666;font-size:13px;margin:4px 0 0">Zona horaria: ${escapeHtml(tzLabel(tz))}.</p>`;

  const body =
    kind === 'cancelled'
      ? `<p>Hola ${escapeHtml(b.name)}, la llamada del <strong>${escapeHtml(when)}</strong> ha quedado cancelada.</p>
         <p>Si quieres, puedes reservar otro momento cuando te venga bien.</p>${button('Reservar otra llamada', `${siteUrl()}/reservas.html`)}`
      : `<p>Hola ${escapeHtml(b.name)}, ${kind === 'confirmed' ? 'gracias por reservar.' : 'tu llamada tiene nueva hora.'}</p>
         <p style="font-size:18px;margin:16px 0 0"><strong>${escapeHtml(when)}</strong></p>${tzNote}
         <p style="margin-top:16px">${escapeHtml(b.meetingDetails)}</p>
         ${button('Cambiar la cita', link)}${button('Cancelar la cita', link, true)}
         <p style="color:#888;font-size:12px;margin-top:20px">Este enlace es personal: no lo compartas.</p>`;
  const text =
    kind === 'cancelled'
      ? `Hola ${b.name}, la llamada del ${when} ha quedado cancelada.\nReservar otra: ${siteUrl()}/reservas.html`
      : `Hola ${b.name}.\n\n${title}: ${when} (${tzLabel(tz)}).\n\n${b.meetingDetails}\n\nCambiar o cancelar: ${link}`;

  const method = kind === 'cancelled' ? 'CANCEL' : 'REQUEST';
  const ics = icsCalendar(
    [
      icsEvent({
        uid: `${b.bookingId}@webs-que-venden`,
        start: new Date(b.startsAt),
        end: new Date(b.endsAt),
        title: `Llamada con ${b.brand}`,
        description: `${b.meetingDetails}\n\nCambiar o cancelar: ${link}`,
        method,
        sequence: b.sequence ?? 0,
      }),
    ],
    { method: kind === 'cancelled' ? 'CANCEL' : 'PUBLISH' },
  );

  return sendEmail({
    to: b.email,
    subject: `${title} · ${b.brand}`,
    html: layout(title, body, b.brand),
    text,
    replyTo: b.replyTo,
    attachments: [{ filename: 'llamada.ics', content: base64(ics), content_type: 'text/calendar' }],
  });
}

export function sendRequestReceivedEmail({ to, name, brand, replyTo }) {
  const body = `<p>Hola ${escapeHtml(name)}, hemos recibido tu solicitud.</p>
<p>Gracias por confiar en nosotros. Revisaremos tu proyecto y nos pondremos en contacto contigo.</p>
${button('Ver nuestros planes', `${siteUrl()}/#planes`)}${button('Agendar una llamada', `${siteUrl()}/reservas.html`, true)}`;
  return sendEmail({
    to,
    subject: `Hemos recibido tu solicitud · ${brand}`,
    html: layout('¡Perfecto! Hemos recibido tu solicitud', body, brand),
    text: `Hola ${name}, hemos recibido tu solicitud. Revisaremos tu proyecto y nos pondremos en contacto contigo.\n\nVer planes: ${siteUrl()}/#planes\nAgendar una llamada: ${siteUrl()}/reservas.html`,
    replyTo,
  });
}

export function sendOrderEmail({ to, name, brand, title, lines, replyTo, link }) {
  const body = `<p>Hola ${escapeHtml(name)},</p>${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}${
    link ? button('Ver el estado de tu pedido', link) : ''
  }`;
  return sendEmail({
    to,
    subject: `${title} · ${brand}`,
    html: layout(title, body, brand),
    text: `Hola ${name},\n\n${lines.join('\n\n')}${link ? `\n\n${link}` : ''}`,
    replyTo,
  });
}
