import 'server-only';
import { integrations, siteUrl } from './env';
import { escapeHtml } from './format';
import { formatDateTime, tzLabel } from './time';

export type EmailResult = 'sent' | 'failed' | 'not_configured';

type Attachment = { filename: string; content: string /* base64 */; content_type?: string };

/** Envía un correo con Resend. Si no está configurado, NO finge el envío. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  attachments?: Attachment[];
}): Promise<EmailResult> {
  if (!integrations.email()) return 'not_configured';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: opts.replyTo || undefined,
        attachments: opts.attachments,
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

export async function notifyAdmin(subject: string, lines: [string, string][], link?: string): Promise<EmailResult> {
  if (!integrations.adminEmail()) return 'not_configured';
  const rows = lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');
  const html = layout(
    subject,
    `<table style="border-collapse:collapse;font-size:14px">${rows}</table>${
      link ? button('Abrir en el panel', link) : ''
    }`,
    'Aviso interno',
  );
  const text = `${subject}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}${link ? `\n\n${link}` : ''}`;
  return sendEmail({ to: process.env.ADMIN_NOTIFY_EMAIL!, subject, html, text });
}

function button(label: string, href: string, secondary = false) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:16px 8px 0 0;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;${
    secondary ? 'background:#f1f1f1;color:#111' : 'background:#111;color:#fff'
  }">${escapeHtml(label)}</a>`;
}

function layout(title: string, body: string, brand: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#777;margin-bottom:12px">${escapeHtml(brand)}</div>
<div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #e7e5e4">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
</div></div></body></html>`;
}

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function icsEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildIcs(opts: {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description: string;
  organizerEmail?: string | null;
  method?: 'PUBLISH' | 'CANCEL';
  sequence?: number;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//webs-que-venden//reservas//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${opts.method ?? 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `SEQUENCE:${opts.sequence ?? 0}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    `DTEND:${icsDate(opts.end)}`,
    `SUMMARY:${icsEscape(opts.title)}`,
    `DESCRIPTION:${icsEscape(opts.description)}`,
    opts.organizerEmail ? `ORGANIZER:mailto:${opts.organizerEmail}` : '',
    `STATUS:${opts.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

type BookingMail = {
  bookingId: string;
  brand: string;
  name: string;
  email: string;
  startsAt: string;
  endsAt: string;
  businessTz: string;
  visitorTz?: string | null;
  meetingDetails: string;
  manageToken: string;
  replyTo?: string | null;
  sequence?: number;
};

export async function sendBookingEmail(kind: 'confirmed' | 'rescheduled' | 'cancelled', b: BookingMail) {
  const tz = b.visitorTz || b.businessTz;
  const when = formatDateTime(b.startsAt, tz);
  const manageUrl = `${siteUrl()}/cita/${b.manageToken}`;
  const titles = {
    confirmed: 'Tu llamada está reservada',
    rescheduled: 'Hemos cambiado la hora de tu llamada',
    cancelled: 'Tu llamada se ha cancelado',
  } as const;
  const title = titles[kind];

  const tzNote =
    tz !== b.businessTz
      ? `<p style="color:#666;font-size:13px;margin:4px 0 0">Hora mostrada en tu zona: ${escapeHtml(tzLabel(tz))}. En nuestra zona (${escapeHtml(
          tzLabel(b.businessTz),
        )}) es ${escapeHtml(formatDateTime(b.startsAt, b.businessTz))}.</p>`
      : `<p style="color:#666;font-size:13px;margin:4px 0 0">Zona horaria: ${escapeHtml(tzLabel(tz))}.</p>`;

  const body =
    kind === 'cancelled'
      ? `<p>Hola ${escapeHtml(b.name)}, la llamada del <strong>${escapeHtml(when)}</strong> ha quedado cancelada.</p>
         <p>Si quieres, puedes reservar otro momento cuando te venga bien.</p>${button('Reservar otra llamada', `${siteUrl()}/reservar`)}`
      : `<p>Hola ${escapeHtml(b.name)}, ${kind === 'confirmed' ? 'gracias por reservar.' : 'tu llamada tiene nueva hora.'}</p>
         <p style="font-size:18px;margin:16px 0 0"><strong>${escapeHtml(when)}</strong></p>${tzNote}
         <p style="margin-top:16px">${escapeHtml(b.meetingDetails)}</p>
         ${button('Cambiar la cita', manageUrl)}${button('Cancelar la cita', `${manageUrl}?accion=cancelar`, true)}
         <p style="color:#888;font-size:12px;margin-top:20px">Este enlace es personal: no lo compartas.</p>`;

  const text =
    kind === 'cancelled'
      ? `Hola ${b.name}, la llamada del ${when} ha quedado cancelada.\nReservar otra: ${siteUrl()}/reservar`
      : `Hola ${b.name}.\n\n${title}: ${when} (${tzLabel(tz)}).\n\n${b.meetingDetails}\n\nCambiar o cancelar: ${manageUrl}`;

  const ics = buildIcs({
    uid: `${b.bookingId}@webs-que-venden`,
    start: new Date(b.startsAt),
    end: new Date(b.endsAt),
    title: `Llamada con ${b.brand}`,
    description: `${b.meetingDetails}\n\nCambiar o cancelar: ${manageUrl}`,
    method: kind === 'cancelled' ? 'CANCEL' : 'PUBLISH',
    sequence: b.sequence ?? 0,
  });

  return sendEmail({
    to: b.email,
    subject: `${title} · ${b.brand}`,
    html: layout(title, body, b.brand),
    text,
    replyTo: b.replyTo,
    attachments: [
      { filename: 'llamada.ics', content: Buffer.from(ics).toString('base64'), content_type: 'text/calendar' },
    ],
  });
}

export async function sendRequestReceivedEmail(opts: { to: string; name: string; brand: string; replyTo?: string | null }) {
  const body = `<p>Hola ${escapeHtml(opts.name)}, hemos recibido tu solicitud.</p>
<p>Revisaremos tu proyecto y nos pondremos en contacto contigo.</p>
${button('Ver nuestros planes', `${siteUrl()}/#planes`)}${button('Agendar una llamada', `${siteUrl()}/reservar`, true)}`;
  return sendEmail({
    to: opts.to,
    subject: `Hemos recibido tu solicitud · ${opts.brand}`,
    html: layout('¡Perfecto! Hemos recibido tu solicitud', body, opts.brand),
    text: `Hola ${opts.name}, hemos recibido tu solicitud. Revisaremos tu proyecto y nos pondremos en contacto contigo.\n\nVer planes: ${siteUrl()}/#planes\nAgendar una llamada: ${siteUrl()}/reservar`,
    replyTo: opts.replyTo,
  });
}

export async function sendOrderEmail(opts: {
  to: string;
  name: string;
  brand: string;
  title: string;
  lines: string[];
  replyTo?: string | null;
}) {
  const body = `<p>Hola ${escapeHtml(opts.name)},</p>${opts.lines
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join('')}`;
  return sendEmail({
    to: opts.to,
    subject: `${opts.title} · ${opts.brand}`,
    html: layout(opts.title, body, opts.brand),
    text: `Hola ${opts.name},\n\n${opts.lines.join('\n\n')}`,
    replyTo: opts.replyTo,
  });
}
