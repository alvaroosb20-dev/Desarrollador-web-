'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browserTimeZone, postJson } from '@/lib/client';
import { validateEmail, validateName, validatePhone } from '@/lib/validation';
import { IconAlert, IconArrow, IconBack, IconCalendar, IconCheck, IconClock, IconGlobe } from './Icons';

type Props = {
  mode: 'new' | 'reschedule';
  token?: string;
  durationMin: number;
  businessTz: string;
  meetingDetails: string;
  prefill?: { name: string; email: string; phone: string };
  linkedToRequest?: boolean;
};

type Day = { key: string; date: Date; slots: string[] };

const dayKeyFmt = (tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });

export default function BookingWidget({ mode, token, durationMin, businessTz, meetingDetails, prefill, linkedToRequest }: Props) {
  const [tz, setTz] = useState(businessTz);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [allSlots, setAllSlots] = useState<string[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [stage, setStage] = useState<'pick' | 'details' | 'done'>('pick');
  const [form, setForm] = useState({ name: prefill?.name ?? '', email: prefill?.email ?? '', phone: prefill?.phone ?? '', summary: '', privacy: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [result, setResult] = useState<{ startsAt: string; emailStatus: string; manageUrl?: string } | null>(null);
  const startedRef = useRef(0);
  const hpRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setTz(browserTimeZone());
    startedRef.current = Date.now();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/booking/slots${token ? `?token=${encodeURIComponent(token)}` : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const slots: string[] = (data.days as { slots: string[] }[]).flatMap((d) => d.slots);
      setAllSlots(slots);
    } catch (e) {
      setLoadError(e instanceof Error && e.message ? e.message : 'No se pudo cargar la disponibilidad.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Agrupa los huecos por día en la zona horaria del visitante
  const days: Day[] = useMemo(() => {
    const fmt = dayKeyFmt(tz);
    const map = new Map<string, Day>();
    for (const s of allSlots) {
      const d = new Date(s);
      const key = fmt.format(d);
      if (!map.has(key)) map.set(key, { key, date: d, slots: [] });
      map.get(key)!.slots.push(s);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [allSlots, tz]);

  useEffect(() => {
    if (!days.length) {
      setDay(null);
      return;
    }
    if (!day || !days.some((d) => d.key === day)) setDay(days[0].key);
  }, [days, day]);

  useEffect(() => {
    if (stage !== 'pick') headingRef.current?.focus();
  }, [stage]);

  const fmtTime = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const fmtLong = (iso: string, zone = tz) =>
    new Intl.DateTimeFormat('es-ES', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const tzName = tz.replace(/_/g, ' ');
  const differentTz = tz !== businessTz;
  const current = days.find((d) => d.key === day);

  const set = (k: keyof typeof form, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const confirmReschedule = async () => {
    if (!slot || !token) return;
    setSubmitting(true);
    setServerError('');
    const res = await postJson<{ startsAt: string; emailStatus: string }>('/api/booking/manage', { token, action: 'reschedule', start: slot });
    setSubmitting(false);
    if (res.ok) {
      setResult({ startsAt: res.startsAt, emailStatus: res.emailStatus });
      setStage('done');
    } else {
      setServerError(res.error);
      setSlot(null);
      load();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot || submitting) return;
    const errs: Record<string, string> = {};
    const n = validateName(form.name.trim());
    if (n) errs.name = n;
    const em = validateEmail(form.email.trim());
    if (em) errs.email = em;
    const ph = validatePhone(form.phone.trim());
    if (ph) errs.phone = ph;
    if (!form.privacy) errs.privacy = 'Debes aceptar la política de privacidad.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    setServerError('');
    const res = await postJson<{ booking: { startsAt: string; emailStatus: string; manageUrl: string } }>('/api/booking', {
      ...form,
      start: slot,
      timezone: tz,
      startedAt: startedRef.current,
      website: hpRef.current?.value ?? '',
    });
    setSubmitting(false);
    if (res.ok) {
      setResult(res.booking);
      setStage('done');
      return;
    }
    setServerError(res.error);
    if (res.field === 'start') {
      setSlot(null);
      setStage('pick');
      load();
    } else if (res.field) {
      setErrors({ [res.field]: res.error });
    }
  };

  // ---------- Confirmación ----------
  if (stage === 'done' && result) {
    return (
      <div className="card" role="status" style={{ maxWidth: 640 }}>
        <div className="success-mark">
          <IconCheck size={30} />
        </div>
        <h2 ref={headingRef} tabIndex={-1} style={{ fontSize: 30 }}>
          {mode === 'new' ? 'Llamada reservada' : 'Cita cambiada'}
        </h2>
        <p style={{ fontSize: 20, margin: '12px 0 4px', textTransform: 'capitalize' }}>{fmtLong(result.startsAt)}</p>
        <p className="muted small">
          Zona horaria: {tzName}
          {differentTz ? ` · En nuestra zona (${businessTz.replace(/_/g, ' ')}): ${fmtLong(result.startsAt, businessTz)}` : ''}
        </p>
        <p className="muted">{meetingDetails}</p>
        {result.emailStatus === 'sent' ? (
          <div className="alert alert-ok">Te hemos enviado un correo con los detalles y los enlaces para cambiar o cancelar la cita.</div>
        ) : (
          <div className="alert alert-warn">
            La cita está guardada, pero no hemos podido enviarte el correo de confirmación.
            {result.manageUrl ? (
              <>
                {' '}
                Guarda este enlace para cambiarla o cancelarla:{' '}
                <Link className="link" href={result.manageUrl}>
                  gestionar mi cita
                </Link>
                .
              </>
            ) : null}
          </div>
        )}
        <div className="row">
          <Link href="/#planes" className="btn btn-primary">
            Ver nuestros planes <IconArrow />
          </Link>
          <Link href="/" className="btn btn-ghost">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Datos ----------
  if (stage === 'details' && slot) {
    return (
      <form className="card" onSubmit={submit} noValidate style={{ maxWidth: 680 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStage('pick')} style={{ marginBottom: 16 }}>
          <IconBack /> Cambiar hora
        </button>
        <h2 ref={headingRef} tabIndex={-1} style={{ fontSize: 26 }}>
          Tus datos
        </h2>
        <p className="muted" style={{ textTransform: 'capitalize' }}>
          <IconCalendar size={16} className="icon" /> {fmtLong(slot)} · {durationMin} min · {tzName}
        </p>
        {linkedToRequest ? <div className="alert">Vincularemos esta llamada a la solicitud que ya nos enviaste.</div> : null}
        <div className="row-2">
          <div className="field">
            <label htmlFor="b-name">Nombre *</label>
            <input id="b-name" className="input" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} maxLength={80} />
            {errors.name ? <p className="error-text"><IconAlert size={16} /> {errors.name}</p> : null}
          </div>
          <div className="field">
            <label htmlFor="b-email">Correo electrónico *</label>
            <input id="b-email" className="input" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email} />
            {errors.email ? <p className="error-text"><IconAlert size={16} /> {errors.email}</p> : null}
          </div>
        </div>
        <div className="field">
          <label htmlFor="b-phone">Teléfono (opcional)</label>
          <input id="b-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={!!errors.phone} />
          {errors.phone ? <p className="error-text"><IconAlert size={16} /> {errors.phone}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="b-summary">Cuéntanos brevemente tu proyecto</label>
          <textarea id="b-summary" className="textarea" value={form.summary} onChange={(e) => set('summary', e.target.value)} maxLength={1000} placeholder="Ej.: necesito una web para mi peluquería con reservas" />
        </div>
        <input ref={hpRef} className="hp" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
        <label className="check">
          <input type="checkbox" checked={form.privacy} onChange={(e) => set('privacy', e.target.checked)} aria-invalid={!!errors.privacy} />
          <span>
            He leído y acepto la{' '}
            <a className="link" href="/legal/privacidad" target="_blank" rel="noopener">
              política de privacidad
            </a>
            . *
          </span>
        </label>
        {errors.privacy ? <p className="error-text"><IconAlert size={16} /> {errors.privacy}</p> : null}
        {serverError && !Object.values(errors).some(Boolean) ? (
          <div className="alert alert-error" role="alert">
            {serverError}
          </div>
        ) : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" /> Reservando…
            </>
          ) : (
            <>
              Confirmar la reserva <IconArrow />
            </>
          )}
        </button>
      </form>
    );
  }

  // ---------- Elegir día y hora ----------
  return (
    <div className="booking">
      <aside className="booking-aside">
        <span className="eyebrow">{mode === 'new' ? 'Llamada inicial' : 'Cambiar cita'}</span>
        <h2>{mode === 'new' ? 'Agenda una llamada' : 'Elige una nueva hora'}</h2>
        <p className="muted small mb-0">Sin compromiso. Hablamos de tu proyecto y te orientamos sobre el plan que mejor encaja.</p>
        <dl>
          <div>
            <dt>Duración</dt>
            <dd className="row" style={{ gap: 8 }}>
              <IconClock size={16} /> {durationMin} minutos
            </dd>
          </div>
          <div>
            <dt>Tu zona horaria</dt>
            <dd className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <IconGlobe size={16} /> {tzName}
            </dd>
          </div>
          <div>
            <dt>Cómo</dt>
            <dd>{meetingDetails}</dd>
          </div>
        </dl>
      </aside>
      <div className="booking-main">
        {serverError ? (
          <div className="alert alert-error" role="alert">
            {serverError}
          </div>
        ) : null}
        {loading ? (
          <div aria-busy="true" aria-label="Cargando disponibilidad">
            <div className="row" style={{ marginBottom: 20 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ width: 76, height: 70 }} />
              ))}
            </div>
            <div className="slots">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 48 }} />
              ))}
            </div>
          </div>
        ) : loadError ? (
          <div className="alert alert-error" role="alert">
            {loadError}{' '}
            <button className="link" style={{ background: 'none', border: 0, font: 'inherit', cursor: 'pointer', padding: 0 }} onClick={load}>
              Reintentar
            </button>
          </div>
        ) : !days.length ? (
          <div>
            <h3 style={{ fontSize: 20 }}>No hay horas libres ahora mismo</h3>
            <p className="muted">
              Ahora mismo no hay huecos disponibles. Escríbenos desde el formulario de contacto y buscamos un momento.
            </p>
            <Link href="/#contacto" className="btn btn-sm">
              Ir al formulario de contacto
            </Link>
          </div>
        ) : (
          <>
            <p className="label" id="days-label">
              Elige un día
            </p>
            <div className="day-strip" role="group" aria-labelledby="days-label">
              {days.map((d) => {
                const wd = new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'short' }).format(d.date);
                const dn = new Intl.DateTimeFormat('es-ES', { timeZone: tz, day: 'numeric' }).format(d.date);
                const mo = new Intl.DateTimeFormat('es-ES', { timeZone: tz, month: 'short' }).format(d.date);
                return (
                  <button
                    key={d.key}
                    type="button"
                    className="day"
                    aria-pressed={day === d.key}
                    aria-label={new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(d.date)}
                    onClick={() => {
                      setDay(d.key);
                      setSlot(null);
                    }}
                  >
                    <small>{wd.replace('.', '')}</small>
                    <strong>{dn}</strong>
                    <small>{mo.replace('.', '')}</small>
                  </button>
                );
              })}
            </div>
            {current ? (
              <>
                <p className="label" id="slots-label" style={{ textTransform: 'capitalize' }}>
                  {new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(current.date)}
                </p>
                <div className="slots" role="group" aria-labelledby="slots-label">
                  {current.slots.map((s) => (
                    <button key={s} type="button" className="slot" aria-pressed={slot === s} onClick={() => setSlot(s)}>
                      {fmtTime(s)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {differentTz ? (
              <p className="hint" style={{ marginTop: 14 }}>
                Las horas se muestran en tu zona horaria ({tzName}). Nuestra zona es {businessTz.replace(/_/g, ' ')}.
              </p>
            ) : null}
            <div style={{ marginTop: 24 }}>
              {mode === 'new' ? (
                <button className="btn btn-primary" disabled={!slot} onClick={() => setStage('details')}>
                  Continuar <IconArrow />
                </button>
              ) : (
                <button className="btn btn-primary" disabled={!slot || submitting} onClick={confirmReschedule} aria-busy={submitting}>
                  {submitting ? <span className="spinner" aria-hidden="true" /> : null} Confirmar nueva hora
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
