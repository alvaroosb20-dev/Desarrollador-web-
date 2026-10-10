'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { newKey, postJson } from '@/lib/client';
import { validateEmail, validateName, validatePhone } from '@/lib/validation';
import { IconAlert, IconArrow, IconCalendar } from './Icons';

type Plan = { slug: string; name: string; price_cents: number; price_from: boolean; limits: string | null };

type Props = {
  pkg: { slug: string; name: string; price_cents: number };
  plans: Plan[];
  paymentMode: 'full' | 'deposit';
  depositPercent: number;
  stripeReady: boolean;
  prefill: { name: string; email: string; phone: string } | null;
  cancelled: boolean;
};

const eur = (c: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 === 0 ? 0 : 2 }).format(c / 100);

export default function CheckoutForm({ pkg, plans, paymentMode, depositPercent, stripeReady, prefill, cancelled }: Props) {
  const [form, setForm] = useState({
    name: prefill?.name ?? '',
    email: prefill?.email ?? '',
    phone: prefill?.phone ?? '',
    requirements: '',
    maintenance: '',
    acceptTerms: false,
    acceptPrivacy: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'pay' | 'quote'>('');
  const [serverError, setServerError] = useState('');
  const keyRef = useRef('');
  const startedRef = useRef(0);
  const hpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    keyRef.current = newKey();
    startedRef.current = Date.now();
  }, []);

  const plan = plans.find((p) => p.slug === form.maintenance) ?? null;
  const dueNow = useMemo(
    () => (paymentMode === 'deposit' ? Math.round((pkg.price_cents * Math.min(100, Math.max(1, depositPercent))) / 100) : pkg.price_cents),
    [pkg.price_cents, paymentMode, depositPercent],
  );
  const hasExtras = form.requirements.trim().length > 0;

  const set = (k: keyof typeof form, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = async (mode: 'pay' | 'quote') => {
    if (busy) return;
    const errs: Record<string, string> = {};
    const n = validateName(form.name.trim());
    if (n) errs.name = n;
    const em = validateEmail(form.email.trim());
    if (em) errs.email = em;
    const ph = validatePhone(form.phone.trim());
    if (ph) errs.phone = ph;
    if (!form.acceptTerms) errs.acceptTerms = 'Debes aceptar las condiciones de contratación.';
    if (!form.acceptPrivacy) errs.acceptPrivacy = 'Debes aceptar la política de privacidad.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(mode);
    setServerError('');
    const res = await postJson<{ redirect: string }>('/api/checkout', {
      package: pkg.slug,
      maintenance: form.maintenance || null,
      requirements: form.requirements,
      name: form.name,
      email: form.email,
      phone: form.phone,
      acceptTerms: form.acceptTerms,
      acceptPrivacy: form.acceptPrivacy,
      mode,
      submissionKey: keyRef.current,
      startedAt: startedRef.current,
      website: hpRef.current?.value ?? '',
    });
    if (res.ok && res.redirect) {
      window.location.assign(res.redirect);
      return;
    }
    setBusy('');
    if (!res.ok) {
      setServerError(res.error);
      if (res.field) setErrors({ [res.field]: res.error });
    }
  };

  const err = (k: string) => (errors[k] ? <p className="error-text"><IconAlert size={16} /> {errors[k]}</p> : null);

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }} data-checkout>
      <form className="card" onSubmit={(e) => { e.preventDefault(); submit(hasExtras ? 'quote' : 'pay'); }} noValidate>
        {cancelled ? <div className="alert alert-warn">Has cancelado el pago. No se ha cobrado nada; puedes intentarlo de nuevo cuando quieras.</div> : null}
        <h2 style={{ fontSize: 22 }}>1. Necesidades especiales</h2>
        <div className="field">
          <label htmlFor="k-req">¿Necesitas algo que no aparezca en el plan? (opcional)</label>
          <textarea id="k-req" className="textarea" value={form.requirements} onChange={(e) => set('requirements', e.target.value)} maxLength={4000} placeholder="Ej.: versión en inglés, integración con mi sistema de reservas, más páginas…" />
          {hasExtras ? (
            <p className="hint">Si lo que pides supera el plan, te enviaremos un presupuesto revisado antes de cobrar nada.</p>
          ) : null}
        </div>

        {plans.length ? (
          <>
            <h2 style={{ fontSize: 22, marginTop: 28 }}>2. Mantenimiento (opcional)</h2>
            <div className="field">
              <label htmlFor="k-m">Plan de mantenimiento mensual</label>
              <select id="k-m" className="select" value={form.maintenance} onChange={(e) => set('maintenance', e.target.value)}>
                <option value="">Sin mantenimiento por ahora</option>
                {plans.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} — {p.price_from ? 'desde ' : ''}
                    {eur(p.price_cents)}/mes
                  </option>
                ))}
              </select>
              {plan ? <p className="hint">{plan.limits} Se factura mensualmente a partir de la entrega; no se cobra ahora.</p> : null}
            </div>
          </>
        ) : null}

        <h2 style={{ fontSize: 22, marginTop: 28 }}>{plans.length ? '3' : '2'}. Tus datos</h2>
        <div className="row-2">
          <div className="field">
            <label htmlFor="k-name">Nombre *</label>
            <input id="k-name" className="input" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} maxLength={80} />
            {err('name')}
          </div>
          <div className="field">
            <label htmlFor="k-email">Correo electrónico *</label>
            <input id="k-email" className="input" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email} />
            {err('email')}
          </div>
        </div>
        <div className="field">
          <label htmlFor="k-phone">Teléfono (opcional)</label>
          <input id="k-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={!!errors.phone} />
          {err('phone')}
        </div>
        <input ref={hpRef} className="hp" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
        <label className="check">
          <input type="checkbox" checked={form.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} aria-invalid={!!errors.acceptTerms} />
          <span>
            He leído y acepto las{' '}
            <a className="link" href="/legal/condiciones" target="_blank" rel="noopener">
              condiciones de contratación
            </a>{' '}
            (alcance, pagos, plazos, revisiones, cancelación y mantenimiento). *
          </span>
        </label>
        {err('acceptTerms')}
        <label className="check">
          <input type="checkbox" checked={form.acceptPrivacy} onChange={(e) => set('acceptPrivacy', e.target.checked)} aria-invalid={!!errors.acceptPrivacy} />
          <span>
            He leído y acepto la{' '}
            <a className="link" href="/legal/privacidad" target="_blank" rel="noopener">
              política de privacidad
            </a>
            . *
          </span>
        </label>
        {err('acceptPrivacy')}
        {serverError && !Object.values(errors).some(Boolean) ? (
          <div className="alert alert-error" role="alert">
            {serverError}
          </div>
        ) : null}
      </form>

      <aside className="card" style={{ position: 'sticky', top: 92 }}>
        <h2 style={{ fontSize: 20 }}>Resumen</h2>
        <div className="stack small" style={{ gap: 10 }}>
          <div className="row between">
            <span>{pkg.name}</span>
            <strong>{eur(pkg.price_cents)}</strong>
          </div>
          {plan ? (
            <div className="row between muted">
              <span>{plan.name}</span>
              <span>
                {plan.price_from ? 'desde ' : ''}
                {eur(plan.price_cents)}/mes
              </span>
            </div>
          ) : null}
          <hr className="divider" />
          <div className="row between">
            <span>Precio total del plan</span>
            <strong>{eur(pkg.price_cents)}</strong>
          </div>
          {!hasExtras ? (
            <div className="row between" style={{ fontSize: 17 }}>
              <span>{paymentMode === 'deposit' ? `A pagar ahora (señal ${depositPercent}%)` : 'A pagar ahora'}</span>
              <strong className="accent">{eur(dueNow)}</strong>
            </div>
          ) : (
            <div className="alert" style={{ margin: 0 }}>
              Has indicado requisitos especiales: te enviaremos el presupuesto final antes de cobrar.
            </div>
          )}
          {paymentMode === 'deposit' && !hasExtras ? (
            <p className="hint mb-0">El resto ({eur(pkg.price_cents - dueNow)}) se abona antes de publicar la web.</p>
          ) : null}
          {plan ? <p className="hint mb-0">Coste recurrente: {plan.name}, {plan.price_from ? 'desde ' : ''}{eur(plan.price_cents)}/mes tras la entrega.</p> : null}
          <p className="hint mb-0">No incluye dominio, hosting, licencias, suscripciones externas ni comisiones de pago salvo acuerdo.</p>
        </div>
        <div className="stack" style={{ marginTop: 20 }}>
          {!hasExtras && stripeReady ? (
            <button className="btn btn-primary btn-block" onClick={() => submit('pay')} disabled={!!busy} aria-busy={busy === 'pay'}>
              {busy === 'pay' ? <span className="spinner" aria-hidden="true" /> : null} Contratar y pagar {eur(dueNow)} <IconArrow />
            </button>
          ) : null}
          {!hasExtras && !stripeReady ? (
            <>
              <div className="alert alert-warn" style={{ margin: 0 }}>
                El pago online está pendiente de activación. Puedes enviar la contratación y te contactaremos para el pago. No se cobrará nada ahora.
              </div>
              <button className="btn btn-primary btn-block" onClick={() => submit('pay')} disabled={!!busy} aria-busy={busy === 'pay'}>
                {busy === 'pay' ? <span className="spinner" aria-hidden="true" /> : null} Enviar contratación <IconArrow />
              </button>
            </>
          ) : null}
          <button className={`btn btn-block ${hasExtras ? 'btn-primary' : ''}`} onClick={() => submit('quote')} disabled={!!busy} aria-busy={busy === 'quote'}>
            {busy === 'quote' ? <span className="spinner" aria-hidden="true" /> : null} Solicitar presupuesto sin pagar
          </button>
          <Link href="/reservar" className="btn btn-call btn-block">
            <IconCalendar /> ¿Necesitas asesoramiento? Agendar una llamada
          </Link>
        </div>
      </aside>
      <style>{`@media (max-width: 900px){[data-checkout]{grid-template-columns:1fr!important}[data-checkout] aside{position:static!important}}`}</style>
    </div>
  );
}
