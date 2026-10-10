import { NextResponse } from 'next/server';
import { cancelBooking, findBookingByToken, rescheduleBooking, SlotTakenError } from '@/lib/booking';
import { clientIpHash, rateLimit } from '@/lib/request-meta';
import { cleanText } from '@/lib/validation';

export const runtime = 'nodejs';

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/** Cancelar o cambiar una cita con el enlace seguro del correo. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Solicitud no válida.');
  }
  const ipHash = await clientIpHash();
  if (!(await rateLimit('manage', ipHash, 20, 3600))) return bad('Demasiados intentos. Espera un poco.', 429);

  const token = cleanText(body.token, 64);
  const booking = await findBookingByToken(token);
  if (!booking) return bad('El enlace no es válido o ha caducado.', 404);
  if (booking.status !== 'confirmed') return bad('Esta cita ya no está activa.');

  try {
    if (body.action === 'cancel') {
      const r = await cancelBooking(booking.id, { reason: cleanText(body.reason, 500), token });
      return NextResponse.json({ ok: true, emailStatus: r.emailStatus });
    }
    if (body.action === 'reschedule') {
      const start = cleanText(body.start, 40);
      if (!start || Number.isNaN(Date.parse(start))) return bad('Elige un nuevo horario.');
      if ((booking.reschedule_count ?? 0) >= 3) return bad('Has cambiado esta cita varias veces. Escríbenos para buscar otro momento.');
      const r = await rescheduleBooking(booking.id, new Date(start).toISOString(), { token });
      return NextResponse.json({ ok: true, startsAt: r.starts_at, emailStatus: r.emailStatus });
    }
    return bad('Acción no válida.');
  } catch (e) {
    if (e instanceof SlotTakenError) return bad(e.message, 409);
    return bad(e instanceof Error ? e.message : 'No se pudo completar la acción.', 400);
  }
}
