'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BUDGETS,
  BUSINESS_TYPES,
  CONTENT_STATUS,
  GOALS,
  NO_NAME,
  QUESTIONS,
  TIMELINES,
  WEBSITE_TYPES,
  emptyAnswers,
  labelOf,
  type Option,
  type WizardAnswers,
} from '@/lib/wizard';
import { validateEmail, validateName, validatePhone } from '@/lib/validation';
import { newKey, postJson, safeStorage } from '@/lib/client';
import { IconAlert, IconArrow, IconBack, IconCalendar, IconCheck } from './Icons';

const DRAFT_KEY = 'wqv_wizard_v1';
const DRAFT_TTL = 24 * 60 * 60 * 1000; // el borrador se descarta a las 24 h

// 0 bienvenida · 1-9 preguntas · 10 resumen · 11 enviado
const LAST_QUESTION = 9;
const SUMMARY = 10;
const DONE = 11;

type Field = keyof WizardAnswers;

const OPTION_STEPS: Record<number, { field: Field; title: string; options: Option[]; cols?: boolean }> = {
  3: { field: 'businessType', title: QUESTIONS.businessType, options: BUSINESS_TYPES, cols: true },
  4: { field: 'websiteType', title: QUESTIONS.websiteType, options: WEBSITE_TYPES },
  5: { field: 'goal', title: QUESTIONS.goal, options: GOALS },
  6: { field: 'budget', title: QUESTIONS.budget, options: BUDGETS },
  7: { field: 'contentStatus', title: QUESTIONS.contentStatus, options: CONTENT_STATUS },
  8: { field: 'timeline', title: QUESTIONS.timeline, options: TIMELINES },
};

const FIELD_STEP: Partial<Record<Field, number>> = {
  name: 1,
  businessName: 2,
  businessType: 3,
  websiteType: 4,
  goal: 5,
  budget: 6,
  contentStatus: 7,
  timeline: 8,
  email: 9,
  phone: 9,
  privacy: 9,
};

type Draft = { answers: WizardAnswers; step: number; savedAt: number; key: string; startedAt: number };

export default function Wizard({ brand, alreadySubmitted }: { brand: string; alreadySubmitted: boolean }) {
  const [answers, setAnswers] = useState<WizardAnswers>(emptyAnswers);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'forward' | 'back'>('forward');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [fromSummary, setFromSummary] = useState(false);
  const [restored, setRestored] = useState(false);
  const [showExisting, setShowExisting] = useState(alreadySubmitted);
  const [hydrated, setHydrated] = useState(false);
  const keyRef = useRef<string>('');
  const startedRef = useRef<number>(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hpRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<number>(1);
  const advanceTimer = useRef<number | null>(null);

  // Recupera el borrador guardado (si no ha caducado)
  useEffect(() => {
    const raw = safeStorage.get(DRAFT_KEY);
    let draft: Draft | null = null;
    try {
      draft = raw ? (JSON.parse(raw) as Draft) : null;
    } catch {
      draft = null;
    }
    if (draft && Date.now() - draft.savedAt < DRAFT_TTL && draft.answers) {
      setAnswers({ ...emptyAnswers, ...draft.answers });
      // Mostramos la bienvenida con la opción de continuar donde lo dejó
      resumeRef.current = Math.min(Math.max(draft.step, 1), SUMMARY);
      keyRef.current = draft.key || newKey();
      startedRef.current = draft.startedAt || Date.now();
      if (draft.step > 0) setRestored(true);
    } else {
      safeStorage.remove(DRAFT_KEY);
      keyRef.current = newKey();
      startedRef.current = Date.now();
    }
    setHydrated(true);
  }, []);

  // Guarda el progreso en cada cambio
  useEffect(() => {
    if (!hydrated || !keyRef.current || step === DONE || (step === 0 && restored)) return;
    const draft: Draft = { answers, step, savedAt: Date.now(), key: keyRef.current, startedAt: startedRef.current };
    safeStorage.set(DRAFT_KEY, JSON.stringify(draft));
  }, [answers, step, restored, hydrated]);

  // Mueve el foco al título de cada paso (accesibilidad y teclado)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const set = useCallback(<K extends Field>(field: K, value: WizardAnswers[K]) => {
    setAnswers((a) => ({ ...a, [field]: value }));
    setFieldErrors((e) => ({ ...e, [field]: undefined }));
    setError(null);
  }, []);

  const validateStep = useCallback(
    (s: number): Partial<Record<Field, string>> => {
      const e: Partial<Record<Field, string>> = {};
      if (s === 1) {
        const err = validateName(answers.name.trim());
        if (err) e.name = err;
      }
      if (s === 2 && !answers.businessName.trim()) e.businessName = 'Escribe el nombre o marca «Todavía no tengo nombre».';
      const opt = OPTION_STEPS[s];
      if (opt && !answers[opt.field]) e[opt.field] = 'Elige una opción para continuar.';
      if (s === 9) {
        const em = validateEmail(answers.email.trim());
        if (em) e.email = em;
        const ph = validatePhone(answers.phone.trim());
        if (ph) e.phone = ph;
        if (!answers.privacy) e.privacy = 'Debes aceptar la política de privacidad para continuar.';
      }
      return e;
    },
    [answers],
  );

  const go = useCallback((to: number, direction: 'forward' | 'back') => {
    setDir(direction);
    setStep(to);
    setError(null);
  }, []);

  const next = useCallback(() => {
    if (step >= 1 && step <= LAST_QUESTION) {
      const e = validateStep(step);
      if (Object.keys(e).length) {
        setFieldErrors(e);
        return;
      }
    }
    if (fromSummary && step <= LAST_QUESTION) {
      setFromSummary(false);
      go(SUMMARY, 'forward');
      return;
    }
    go(Math.min(step + 1, SUMMARY), 'forward');
  }, [step, validateStep, fromSummary, go]);

  const back = useCallback(() => {
    if (fromSummary) {
      setFromSummary(false);
      go(SUMMARY, 'back');
      return;
    }
    go(Math.max(step - 1, 0), 'back');
  }, [step, fromSummary, go]);

  const choose = useCallback(
    (field: Field, value: string) => {
      set(field, value as never);
      // avance automático suave tras elegir una opción
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      advanceTimer.current = window.setTimeout(() => {
        advanceTimer.current = null;
        setFieldErrors({});
        if (fromSummary) {
          setFromSummary(false);
          go(SUMMARY, 'forward');
        } else {
          go(step + 1, 'forward');
        }
      }, 260);
    },
    [set, step, fromSummary, go],
  );

  // Atajos de teclado: Enter continúa, números eligen opción
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox');
      const opt = OPTION_STEPS[step];
      if (opt && !typing && /^[1-9]$/.test(e.key)) {
        const o = opt.options[Number(e.key) - 1];
        if (o) {
          e.preventDefault();
          choose(opt.field, o.value);
        }
      }
      if (e.key === 'Enter' && !e.shiftKey && step >= 1 && step <= LAST_QUESTION && target.tagName !== 'BUTTON' && target.tagName !== 'A') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, choose, next]);

  const submit = async () => {
    if (submitting) return;
    for (let s = 1; s <= LAST_QUESTION; s++) {
      const e = validateStep(s);
      if (Object.keys(e).length) {
        setFieldErrors(e);
        setFromSummary(true);
        go(s, 'back');
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    const res = await postJson('/api/lead', {
      answers: { ...answers, name: answers.name.trim(), email: answers.email.trim(), phone: answers.phone.trim() },
      submissionKey: keyRef.current,
      startedAt: startedRef.current,
      website: hpRef.current?.value ?? '',
    });
    setSubmitting(false);
    if (res.ok) {
      safeStorage.remove(DRAFT_KEY);
      go(DONE, 'forward');
      return;
    }
    setError(res.error);
    const f = res.field as Field | undefined;
    if (f && FIELD_STEP[f]) {
      setFieldErrors({ [f]: res.error });
      setFromSummary(true);
      go(FIELD_STEP[f]!, 'back');
    }
  };

  const restart = () => {
    safeStorage.remove(DRAFT_KEY);
    keyRef.current = newKey();
    startedRef.current = Date.now();
    setAnswers(emptyAnswers);
    setFieldErrors({});
    setRestored(false);
    setShowExisting(false);
    go(0, 'back');
  };

  const progress = useMemo(() => {
    if (step === 0) return 0;
    if (step >= SUMMARY) return 100;
    return Math.round((step / SUMMARY) * 100);
  }, [step]);

  const anim = dir === 'forward' ? 'step-enter-forward' : 'step-enter-back';
  const errorFor = (f: Field) =>
    fieldErrors[f] ? (
      <p className="error-text" id={`err-${f}`} role="alert">
        <IconAlert size={16} /> {fieldErrors[f]}
      </p>
    ) : null;

  // ---------- Pantallas ----------
  let content: React.ReactNode;

  if (showExisting && step === 0) {
    content = (
      <div className={`wizard-step ${anim}`}>
        <div className="success-mark">
          <IconCheck size={30} />
        </div>
        <h1 ref={headingRef} tabIndex={-1}>
          Ya hemos recibido tu solicitud
        </h1>
        <p className="sub">Puedes ver la web, nuestros planes o agendar una llamada. Si quieres contarnos otro proyecto, envía una nueva solicitud.</p>
        <div className="row">
          <Link href="/#planes" className="btn btn-primary">
            Ver nuestros planes <IconArrow />
          </Link>
          <Link href="/reservar" className="btn btn-call">
            <IconCalendar /> Agendar una llamada
          </Link>
          <button className="btn btn-ghost" onClick={restart}>
            Enviar otra solicitud
          </button>
        </div>
      </div>
    );
  } else if (step === 0) {
    content = (
      <div className={`wizard-step ${anim}`}>
        <span className="eyebrow">{brand}</span>
        <h1 ref={headingRef} tabIndex={-1}>
          Vamos a crear la web que tu negocio <span className="serif accent">necesita</span>
        </h1>
        <p className="sub">Responde a unas sencillas preguntas y te ayudaremos a encontrar la mejor solución para tu proyecto.</p>
        {restored ? (
          <div className="alert" role="status">
            Hemos recuperado tus respuestas anteriores.{' '}
            <button className="link" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }} onClick={restart}>
              Empezar de cero
            </button>
          </div>
        ) : null}
        <div className="row">
          <button className="btn btn-primary" onClick={() => {
              setRestored(false);
              go(restored ? resumeRef.current : 1, 'forward');
            }} autoFocus>
            {restored ? 'Continuar' : 'Empezar'} <IconArrow />
          </button>
          <span className="muted small">
            <IconClockInline /> Menos de 2 minutos
          </span>
        </div>
      </div>
    );
  } else if (step === 1) {
    content = (
      <div className={`wizard-step ${anim}`}>
        <StepCount n={1} />
        <h2 ref={headingRef} tabIndex={-1}>
          <label htmlFor="w-name">{QUESTIONS.name}</label>
        </h2>
        <div className="field">
          <input
            id="w-name"
            className="input"
            autoComplete="given-name"
            placeholder="Tu nombre"
            value={answers.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? 'err-name' : undefined}
            maxLength={80}
            autoFocus
          />
          {errorFor('name')}
        </div>
      </div>
    );
  } else if (step === 2) {
    const noName = answers.businessName === NO_NAME;
    content = (
      <div className={`wizard-step ${anim}`}>
        <StepCount n={2} />
        <h2 ref={headingRef} tabIndex={-1}>
          <label htmlFor="w-bn">{QUESTIONS.businessName}</label>
        </h2>
        <div className="field">
          <input
            id="w-bn"
            className="input"
            autoComplete="organization"
            placeholder="Nombre de tu empresa o proyecto"
            value={noName ? '' : answers.businessName}
            disabled={noName}
            onChange={(e) => set('businessName', e.target.value)}
            aria-invalid={!!fieldErrors.businessName}
            aria-describedby={fieldErrors.businessName ? 'err-businessName' : undefined}
            maxLength={120}
            autoFocus
          />
          <label className="check" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={noName} onChange={(e) => set('businessName', e.target.checked ? NO_NAME : '')} />
            <span>Todavía no tengo nombre</span>
          </label>
          {errorFor('businessName')}
        </div>
      </div>
    );
  } else if (OPTION_STEPS[step]) {
    const o = OPTION_STEPS[step];
    content = (
      <div className={`wizard-step ${anim}`}>
        <StepCount n={step} />
        <h2 ref={headingRef} tabIndex={-1} id={`q-${step}`}>
          {o.title}
        </h2>
        <div className={`options${o.cols ? ' cols-2' : ''}`} role="radiogroup" aria-labelledby={`q-${step}`}>
          {o.options.map((opt, i) => {
            const checked = answers[o.field] === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={checked}
                className="option"
                onClick={() => choose(o.field, opt.value)}
              >
                <span className="dot" aria-hidden="true" />
                <span>{opt.label}</span>
                <span className="kbd" aria-hidden="true">
                  {i + 1}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}>{errorFor(o.field)}</div>
      </div>
    );
  } else if (step === 9) {
    content = (
      <div className={`wizard-step ${anim}`}>
        <StepCount n={9} />
        <h2 ref={headingRef} tabIndex={-1}>
          {QUESTIONS.contact}
        </h2>
        <p className="sub">
          Solo usaremos tus datos para responder a tu solicitud, {answers.name.trim() || 'de verdad'}.
        </p>
        <div className="field">
          <label htmlFor="w-name2">Nombre</label>
          <input id="w-name2" className="input" value={answers.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={80} />
          {errorFor('name')}
        </div>
        <div className="row-2">
          <div className="field">
            <label htmlFor="w-email">Correo electrónico *</label>
            <input
              id="w-email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              value={answers.email}
              onChange={(e) => set('email', e.target.value)}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? 'err-email' : undefined}
              required
              autoFocus
            />
            {errorFor('email')}
          </div>
          <div className="field">
            <label htmlFor="w-phone">Teléfono o WhatsApp (opcional)</label>
            <input
              id="w-phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+34 600 000 000"
              value={answers.phone}
              onChange={(e) => set('phone', e.target.value)}
              aria-invalid={!!fieldErrors.phone}
              aria-describedby={fieldErrors.phone ? 'err-phone' : undefined}
            />
            {errorFor('phone')}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={answers.privacy} onChange={(e) => set('privacy', e.target.checked)} aria-invalid={!!fieldErrors.privacy} />
          <span>
            He leído y acepto la{' '}
            <a className="link" href="/legal/privacidad" target="_blank" rel="noopener">
              política de privacidad
            </a>
            . *
          </span>
        </label>
        {errorFor('privacy')}
        <label className="check">
          <input type="checkbox" checked={answers.marketing} onChange={(e) => set('marketing', e.target.checked)} />
          <span>Quiero recibir novedades y ofertas por correo (opcional, puedes darte de baja cuando quieras).</span>
        </label>
      </div>
    );
  } else if (step === SUMMARY) {
    const rows: { q: string; a: string; s: number }[] = [
      { q: 'Nombre', a: answers.name, s: 1 },
      { q: 'Empresa o proyecto', a: answers.businessName === NO_NAME ? 'Todavía no tengo nombre' : answers.businessName, s: 2 },
      { q: 'Tipo de negocio', a: labelOf(BUSINESS_TYPES, answers.businessType), s: 3 },
      { q: 'Tipo de web', a: labelOf(WEBSITE_TYPES, answers.websiteType), s: 4 },
      { q: 'Objetivo', a: labelOf(GOALS, answers.goal), s: 5 },
      { q: 'Presupuesto', a: labelOf(BUDGETS, answers.budget), s: 6 },
      { q: 'Contenido', a: labelOf(CONTENT_STATUS, answers.contentStatus), s: 7 },
      { q: 'Plazo', a: labelOf(TIMELINES, answers.timeline), s: 8 },
      { q: 'Correo', a: answers.email, s: 9 },
      { q: 'Teléfono', a: answers.phone || '—', s: 9 },
    ];
    content = (
      <div className={`wizard-step ${anim}`}>
        <span className="step-count">Resumen</span>
        <h2 ref={headingRef} tabIndex={-1}>
          Revisa tus respuestas
        </h2>
        <p className="sub">Puedes cambiar cualquier respuesta antes de enviar.</p>
        <div className="summary">
          {rows.map((r) => (
            <div className="summary-row" key={r.q}>
              <span className="q">{r.q}</span>
              <span className="a">{r.a}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setFromSummary(true);
                  go(r.s, 'back');
                }}
                aria-label={`Modificar: ${r.q}`}
              >
                Modificar
              </button>
            </div>
          ))}
        </div>
        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}
        <input ref={hpRef} className="hp" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
        <button className="btn btn-primary btn-block" onClick={submit} disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" /> Enviando…
            </>
          ) : (
            <>
              Enviar solicitud <IconArrow />
            </>
          )}
        </button>
      </div>
    );
  } else {
    content = (
      <div className={`wizard-step ${anim}`}>
        <div className="success-mark">
          <IconCheck size={30} />
        </div>
        <h1 ref={headingRef} tabIndex={-1}>
          ¡Perfecto! Hemos recibido tu solicitud
        </h1>
        <p className="sub">Gracias por confiar en nosotros. Revisaremos tu proyecto y nos pondremos en contacto contigo.</p>
        <div className="row">
          <Link href="/#planes" className="btn btn-primary">
            Ver nuestros planes <IconArrow />
          </Link>
          <Link href="/reservar" className="btn btn-call">
            <IconCalendar /> Agendar una llamada
          </Link>
        </div>
      </div>
    );
  }

  const showNav = step >= 1 && step <= LAST_QUESTION;

  return (
    <div className="wizard">
      <div className="wizard-top">
        <div className="container">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">
              {brand.trim().charAt(0).toUpperCase()}
            </span>
            <span>{brand}</span>
          </span>
          {step >= 1 && step <= SUMMARY ? (
            <span className="progress-label" aria-live="polite">
              {step <= LAST_QUESTION ? `Paso ${step} de ${LAST_QUESTION}` : 'Revisión final'}
            </span>
          ) : null}
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label="Progreso del formulario"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div style={{ width: `${progress}%` }} />
        </div>
      </div>

      <main id="contenido" className="wizard-main">
        <div className="container" key={step}>
          {content}
        </div>
      </main>

      {showNav || step === SUMMARY ? (
        <div className="wizard-nav">
          <div className="container">
            <button className="btn btn-ghost" onClick={back} disabled={submitting}>
              <IconBack /> Atrás
            </button>
            {showNav ? (
              <button className="btn btn-primary" onClick={next}>
                {fromSummary ? 'Guardar y volver' : step === LAST_QUESTION ? 'Revisar' : 'Continuar'} <IconArrow />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepCount({ n }: { n: number }) {
  return (
    <span className="step-count">
      {String(n).padStart(2, '0')} <span style={{ color: 'var(--text-3)' }}>/ {String(LAST_QUESTION).padStart(2, '0')}</span>
    </span>
  );
}

function IconClockInline() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
