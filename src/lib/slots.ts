// Cálculo puro de horarios disponibles (sin acceso a base de datos).
import { addDays, isoWeekday, parseHm, todayIn, ymdToString, zonedToUtc, type YMD } from './time';

export type WeeklyHours = Record<string, { start: string; end: string }[]>;

export type BookingConfig = {
  enabled: boolean;
  timezone: string;
  duration_min: number;
  buffer_min: number;
  min_notice_min: number;
  max_advance_days: number;
  weekly_hours: WeeklyHours;
};

export type BusyRange = { start: Date; end: Date };

export type DaySlots = { date: string; weekday: number; slots: string[] };

function overlaps(aStart: number, aEnd: number, b: BusyRange): boolean {
  return aStart < b.end.getTime() && b.start.getTime() < aEnd;
}

/**
 * Genera los huecos libres entre `from` y `to` (fechas de calendario en la zona
 * del negocio, ambas incluidas). Cada hueco ocupa duración + descanso, que es
 * exactamente el rango que bloquea la restricción de la base de datos.
 */
export function computeSlots(
  cfg: BookingConfig,
  busy: BusyRange[],
  from: YMD,
  to: YMD,
  now: Date = new Date(),
): DaySlots[] {
  const result: DaySlots[] = [];
  if (!cfg.enabled) return result;

  const step = cfg.duration_min + cfg.buffer_min;
  const earliest = now.getTime() + cfg.min_notice_min * 60000;
  const today = todayIn(cfg.timezone, now);
  const lastDay = addDays(today, cfg.max_advance_days);
  const lastStr = ymdToString(lastDay);
  const fromStr = ymdToString(from) < ymdToString(today) ? ymdToString(today) : ymdToString(from);

  let day: YMD = ymdToString(from) < ymdToString(today) ? today : from;
  let guard = 0;
  while (ymdToString(day) <= ymdToString(to) && ymdToString(day) <= lastStr && guard++ < 400) {
    if (ymdToString(day) >= fromStr) {
      const wd = isoWeekday(day);
      const ranges = cfg.weekly_hours[String(wd)] ?? [];
      const slots: string[] = [];
      for (const r of ranges) {
        const s = parseHm(r.start);
        const e = parseHm(r.end);
        if (!s || !e) continue;
        const startMin = s.h * 60 + s.min;
        const endMin = e.h * 60 + e.min;
        for (let t = startMin; t + cfg.duration_min <= endMin; t += step) {
          const at = zonedToUtc(day.y, day.m, day.d, Math.floor(t / 60), t % 60, cfg.timezone);
          if (!at) continue; // hora inexistente por cambio de horario
          const startTs = at.getTime();
          if (startTs < earliest) continue;
          const blockedEnd = startTs + step * 60000;
          if (busy.some((b) => overlaps(startTs, blockedEnd, b))) continue;
          slots.push(at.toISOString());
        }
      }
      slots.sort();
      result.push({ date: ymdToString(day), weekday: wd, slots: Array.from(new Set(slots)) });
    }
    day = addDays(day, 1);
  }
  return result;
}

/** Comprueba en el servidor que un instante concreto es un hueco válido y libre. */
export function isSlotAvailable(cfg: BookingConfig, busy: BusyRange[], startIso: string, now: Date = new Date()): boolean {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return false;
  // Probamos el día anterior, el mismo y el siguiente en UTC para cubrir cualquier zona.
  const d = new Date(start.getTime());
  const days: YMD[] = [-1, 0, 1].map((n) => {
    const x = new Date(d.getTime() + n * 86400000);
    return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
  });
  const all = computeSlots(cfg, busy, days[0], days[2], now);
  return all.some((day) => day.slots.includes(start.toISOString()));
}

export function normalizeWeeklyHours(input: unknown): WeeklyHours {
  const out: WeeklyHours = {};
  if (!input || typeof input !== 'object') return out;
  for (let wd = 1; wd <= 7; wd++) {
    const list = (input as Record<string, unknown>)[String(wd)];
    if (!Array.isArray(list)) continue;
    const clean = list
      .filter(
        (r): r is { start: string; end: string } =>
          !!r && typeof r === 'object' && typeof (r as any).start === 'string' && typeof (r as any).end === 'string',
      )
      .filter((r) => {
        const s = parseHm(r.start);
        const e = parseHm(r.end);
        return s && e && s.h * 60 + s.min < e.h * 60 + e.min;
      })
      .map((r) => ({ start: r.start, end: r.end }));
    if (clean.length) out[String(wd)] = clean;
  }
  return out;
}
