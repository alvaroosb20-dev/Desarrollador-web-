import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { serviceClient } from '@/lib/supabase/server';
import { upsertContact } from '@/lib/contacts';
import { createBooking, SlotTakenError } from '@/lib/booking';
import { LEAD_COOKIE, verifyLead } from '@/lib/lead-cookie';
import { clientIpHash, rateLimit } from '@/lib/request-meta';
import { cleanText, looksLikeBot, normalizePhone, validateEmail, validateName, validatePhone } from '@/lib/validation';
import { isValidTimeZone } from '@/lib/time';

export const runtime = 'nodejs';

const bad = (error: string, field?: string, status = 400) => NextResponse.json({ ok: false, error, field }, { status });

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Solicitud no válida.');
  }
  if (looksLikeBot(body as any, 3000)) return bad('No hemos podido verificar la reserva. Inténtalo de nuevo.');

  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = normalizePhone(cleanText(body.phone, 30));
  const summary = cleanText(body.summary, 1000);
  const start = cleanText(body.start, 40);
  const tz = cleanText(body.timezone, 60);
  const privacy = body.privacy === true;

  const e1 = validateName(name);
  if (e1) return bad(e1, 'name');
  const e2 = validateEmail(email);
  if (e2) return bad(e2, 'email');
  const e3 = validatePhone(phone);
  if (e3) return bad(e3, 'phone');
  if (!privacy) return bad('Debes aceptar la política de privacidad.', 'privacy');
  if (!start || Number.isNaN(Date.parse(start))) return bad('Elige un día y una hora.', 'start');

  const ipHash = await clientIpHash();
  if (!(await rateLimit('booking', ipHash, 6, 3600))) {
    return bad('Has hecho varias reservas seguidas. Espera un poco o escríbenos.', undefined, 429);
  }

  const db = serviceClient();
  try {
    // ¿Viene de completar el formulario? → vinculamos la reserva a su solicitud.
    const store = await cookies();
    let requestId = await verifyLead(store.get(LEAD_COOKIE)?.value);
    if (requestId) {
      const { data: r } = await db.from('requests').select('id').eq('id', requestId).maybeSingle();
      if (!r) requestId = null;
    }

    const contact = await upsertContact(db, { name, email, phone: phone || null });

    // Sin cookie: si ese correo ya tiene una solicitud, vinculamos a la más reciente.
    if (!requestId) {
      const { data: last } = await db
        .from('requests')
        .select('id')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      requestId = last?.id ?? null;
    }

    // Evita que la misma persona acumule muchas citas futuras.
    const { count } = await db
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', contact.id)
      .eq('status', 'confirmed')
      .gt('starts_at', new Date().toISOString());
    if ((count ?? 0) >= 2) {
      return bad('Ya tienes citas pendientes con nosotros. Puedes cambiarlas desde el enlace del correo de confirmación.');
    }

    const booking = await createBooking({
      contactId: contact.id,
      requestId,
      startIso: new Date(start).toISOString(),
      name,
      email,
      phone: phone || null,
      summary,
      visitorTz: tz && isValidTimeZone(tz) ? tz : null,
    });

    return NextResponse.json({
      ok: true,
      booking: {
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        timezone: booking.timezone,
        emailStatus: booking.emailStatus,
        manageUrl: `/cita/${booking.token}`,
      },
    });
  } catch (e) {
    if (e instanceof SlotTakenError) return bad(e.message, 'start', 409);
    console.error('booking error', e);
    const msg = e instanceof Error && e.message.startsWith('Las reservas') ? e.message : 'No hemos podido guardar la reserva. Inténtalo de nuevo.';
    return bad(msg, undefined, 500);
  }
}
