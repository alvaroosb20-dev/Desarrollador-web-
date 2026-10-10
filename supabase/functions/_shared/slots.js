// Cálculo puro de horarios disponibles (sin acceso a base de datos).
import { addDays, isoWeekday, parseHm, todayIn, ymdToString, zonedToUtc } from './time.js';

function overlaps(aStart, aEnd, b) {
  return aStart < b.end.getTime() && b.start.getTime() < aEnd;
}

/**
 * Huecos libres entre `from` y `to` (fechas de calendario en la zona del negocio,
 * ambas incluidas). Cada hueco ocupa duración + descanso, que es exactamente el
 * rango que bloquea la restricción anti-solapamiento de la base de datos.
 * @param {{enabled:boolean,timezone:string,duration_min:number,buffer_min:number,min_notice_min:number,max_advance_days:number,weekly_hours:Record<string,{start:string,end:string}[]>}} cfg
 * @param {{start:Date,end:Date}[]} busy
 */
export function computeSlots(cfg, busy, from, to, now = new Date()) {
  const result = [];
  if (!cfg.enabled) return result;

  const step = cfg.duration_min + cfg.buffer_min;
  const earliest = now.getTime() + cfg.min_notice_min * 60000;
  const today = todayIn(cfg.timezone, now);
  const lastStr = ymdToString(addDays(today, cfg.max_advance_days));
  let day = ymdToString(from) < ymdToString(today) ? today : from;
  let guard = 0;
  while (ymdToString(day) <= ymdToString(to) && ymdToString(day) <= lastStr && guard++ < 400) {
    const wd = isoWeekday(day);
    const ranges = cfg.weekly_hours[String(wd)] ?? [];
    const slots = [];
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
    day = addDays(day, 1);
  }
  return result;
}

/** Comprueba en el servidor que un instante concreto es un hueco válido y libre. */
export function isSlotAvailable(cfg, busy, startIso, now = new Date()) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return false;
  const days = [-1, 0, 1].map((n) => {
    const x = new Date(start.getTime() + n * 86400000);
    return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
  });
  return computeSlots(cfg, busy, days[0], days[2], now).some((d) => d.slots.includes(start.toISOString()));
}

export function normalizeWeeklyHours(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (let wd = 1; wd <= 7; wd++) {
    const list = input[String(wd)];
    if (!Array.isArray(list)) continue;
    const clean = list
      .filter((r) => r && typeof r === 'object' && typeof r.start === 'string' && typeof r.end === 'string')
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

export function normalizeBookingSettings(data) {
  return {
    enabled: Boolean(data?.enabled),
    timezone: data?.timezone ?? 'Atlantic/Canary',
    duration_min: data?.duration_min ?? 15,
    buffer_min: data?.buffer_min ?? 5,
    min_notice_min: data?.min_notice_min ?? 720,
    max_advance_days: data?.max_advance_days ?? 30,
    weekly_hours: normalizeWeeklyHours(data?.weekly_hours),
    meeting_details: data?.meeting_details ?? '',
  };
}
