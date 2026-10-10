import { NextResponse } from 'next/server';
import { defaultRange, findBookingByToken, getAvailableSlots } from '@/lib/booking';
import { getBookingSettings } from '@/lib/settings';
import { addDays, parseYmd, ymdToString } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Devuelve SOLO huecos libres: nunca datos de otras reservas. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const cfg = await getBookingSettings();
    const def = defaultRange(cfg);
    const from = parseYmd(url.searchParams.get('from') ?? '') ?? def.from;
    let to = parseYmd(url.searchParams.get('to') ?? '') ?? def.to;
    // como máximo 62 días por consulta
    if (ymdToString(to) > ymdToString(addDays(from, 62))) to = addDays(from, 62);

    // Al reprogramar, el hueco actual de esa cita cuenta como libre.
    let excludeId: string | undefined;
    const token = url.searchParams.get('token');
    if (token) {
      const b = await findBookingByToken(token);
      if (b && b.status === 'confirmed') excludeId = b.id;
    }

    const { days } = await getAvailableSlots(from, to, excludeId);
    return NextResponse.json(
      {
        ok: true,
        enabled: cfg.enabled,
        timezone: cfg.timezone,
        durationMin: cfg.duration_min,
        days: days.filter((d) => d.slots.length > 0),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('slots error', e);
    return NextResponse.json({ ok: false, error: 'No se pudo cargar la disponibilidad.' }, { status: 500 });
  }
}
