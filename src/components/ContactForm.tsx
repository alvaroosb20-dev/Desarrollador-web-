'use client';

import { useEffect, useRef, useState } from 'react';
import { newKey, postJson } from '@/lib/client';
import { validateEmail, validateName, validatePhone } from '@/lib/validation';
import { IconAlert, IconArrow, IconCheck } from './Icons';

type Errors = Partial<Record<'name' | 'email' | 'phone' | 'message' | 'privacy', string>>;

export default function ContactForm({ topics }: { topics: string[] }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', topic: '', message: '', privacy: false });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [serverError, setServerError] = useState('');
  const keyRef = useRef('');
  const startedRef = useRef(0);
  const hpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    keyRef.current = newKey();
    startedRef.current = Date.now();
    // Los botones «Solicitar información» de los servicios preseleccionan el asunto
    const onTopic = (e: Event) => {
      const topic = (e as CustomEvent<string>).detail;
      if (typeof topic === 'string') setForm((f) => ({ ...f, topic }));
    };
    window.addEventListener('wqv:topic', onTopic);
    return () => window.removeEventListener('wqv:topic', onTopic);
  }, []);

  const set = (k: keyof typeof form, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;
    const errs: Errors = {};
    const n = validateName(form.name.trim());
    if (n) errs.name = n;
    const em = validateEmail(form.email.trim());
    if (em) errs.email = em;
    const ph = validatePhone(form.phone.trim());
    if (ph) errs.phone = ph;
    if (form.message.trim().length < 10) errs.message = 'Cuéntanos un poco más (mínimo 10 caracteres).';
    if (!form.privacy) errs.privacy = 'Debes aceptar la política de privacidad.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setStatus('sending');
    const res = await postJson('/api/contact', {
      ...form,
      submissionKey: keyRef.current,
      startedAt: startedRef.current,
      website: hpRef.current?.value ?? '',
    });
    if (res.ok) {
      setStatus('sent');
      return;
    }
    setStatus('error');
    setServerError(res.error);
    if (res.field) setErrors({ [res.field]: res.error } as Errors);
  };

  if (status === 'sent') {
    return (
      <div className="card" role="status">
        <div className="success-mark" style={{ width: 52, height: 52, borderRadius: 16, marginBottom: 20 }}>
          <IconCheck size={24} />
        </div>
        <h3 style={{ fontSize: 24 }}>Mensaje enviado</h3>
        <p className="muted mb-0">Gracias. Te responderemos lo antes posible al correo que nos has indicado.</p>
      </div>
    );
  }

  const err = (k: keyof Errors) =>
    errors[k] ? (
      <p className="error-text" id={`c-err-${k}`}>
        <IconAlert size={16} /> {errors[k]}
      </p>
    ) : null;

  return (
    <form className="card" onSubmit={submit} noValidate aria-label="Formulario de contacto">
      <div className="row-2">
        <div className="field">
          <label htmlFor="c-name">Nombre *</label>
          <input id="c-name" className="input" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'c-err-name' : undefined} maxLength={80} />
          {err('name')}
        </div>
        <div className="field">
          <label htmlFor="c-email">Correo electrónico *</label>
          <input id="c-email" className="input" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'c-err-email' : undefined} />
          {err('email')}
        </div>
      </div>
      <div className="row-2">
        <div className="field">
          <label htmlFor="c-phone">Teléfono (opcional)</label>
          <input id="c-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={!!errors.phone} />
          {err('phone')}
        </div>
        <div className="field">
          <label htmlFor="c-topic">Asunto</label>
          <select id="c-topic" className="select" value={form.topic} onChange={(e) => set('topic', e.target.value)}>
            <option value="">Consulta general</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="c-msg">Mensaje *</label>
        <textarea id="c-msg" className="textarea" value={form.message} onChange={(e) => set('message', e.target.value)} aria-invalid={!!errors.message} aria-describedby={errors.message ? 'c-err-message' : undefined} maxLength={3000} placeholder="Cuéntanos qué necesitas" />
        {err('message')}
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
      {err('privacy')}
      {status === 'error' && serverError && !Object.keys(errors).length ? (
        <div className="alert alert-error" role="alert">
          {serverError}
        </div>
      ) : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={status === 'sending'} aria-busy={status === 'sending'}>
        {status === 'sending' ? (
          <>
            <span className="spinner" aria-hidden="true" /> Enviando…
          </>
        ) : (
          <>
            Enviar mensaje <IconArrow />
          </>
        )}
      </button>
    </form>
  );
}
