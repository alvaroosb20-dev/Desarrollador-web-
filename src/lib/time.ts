// Utilidades de zona horaria sin dependencias (Intl).
// Todas las fechas se guardan en UTC; se convierten a la zona del negocio
// para calcular horarios y a la del visitante para mostrarlos.

export type YMD = { y: number; m: number; d: number };

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Componentes de fecha/hora de un instante en una zona horaria. */
export function zonedParts(date: Date, tz: string) {
  const parts = partsFormatter(tz).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')),
    min: Number(get('minute')),
    s: Number(get('second')),
    weekday: WD[get('weekday')] ?? 1,
  };
}

/** Desfase (minutos) de la zona respecto a UTC en un instante. */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * Convierte una hora local (en `tz`) a instante UTC.
 * Para horas inexistentes (cambio de horario) devuelve null.
 */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date | null {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let ts = guess - tzOffsetMinutes(new Date(guess), tz) * 60000;
  ts = guess - tzOffsetMinutes(new Date(ts), tz) * 60000;
  const back = zonedParts(new Date(ts), tz);
  if (back.y !== y || back.m !== m || back.d !== d || back.h !== h || back.min !== min) return null;
  return new Date(ts);
}

export function ymdToString({ y, m, d }: YMD): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseYmd(s: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

export function addDays({ y, m, d }: YMD, n: number): YMD {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha de calendario. */
export function isoWeekday({ y, m, d }: YMD): number {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function todayIn(tz: string, now = new Date()): YMD {
  const p = zonedParts(now, tz);
  return { y: p.y, m: p.m, d: p.d };
}

export function parseHm(s: string): { h: number; min: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? { h: Number(m[1]), min: Number(m[2]) } : null;
}

export function formatDateTime(date: Date | string, tz: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  }).format(typeof date === 'string' ? new Date(date) : date);
}

export function formatTime(date: Date | string, tz: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(
    typeof date === 'string' ? new Date(date) : date,
  );
}

export function tzLabel(tz: string, at = new Date()): string {
  const off = tzOffsetMinutes(at, tz);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${tz.replace(/_/g, ' ')} (UTC${sign}${hh}:${mm})`;
}
