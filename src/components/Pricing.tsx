import Link from 'next/link';
import type { Addon, MaintenancePlan, Package } from '@/lib/types';
import { euros } from '@/lib/format';
import { IconArrow, IconCheck, IconClock, IconShield } from './Icons';
import BookCallButton from './BookCallButton';

export const NOT_INCLUDED = [
  'Dominio',
  'Hosting',
  'Licencias de pago',
  'Suscripciones a plataformas externas',
  'Comisiones de pago',
  'Carga masiva de productos',
  'Funciones personalizadas que excedan el paquete',
  'Mantenimiento mensual',
];

export function PricingCards({ packages }: { packages: Package[] }) {
  if (!packages.length) {
    return <p className="muted">Estamos actualizando nuestros planes. Agenda una llamada y te informamos.</p>;
  }
  return (
    <div className="pricing">
      {packages.map((p, i) => (
        <article key={p.id} className={`card price-card reveal${p.highlighted ? ' is-featured' : ''}`} style={{ transitionDelay: `${i * 80}ms` }}>
          {p.badge ? <span className="badge badge-accent">{p.badge}</span> : null}
          <h3>{p.name}</h3>
          <p className="audience">{p.audience}</p>
          <div className="price">
            <strong>{euros(p.price_cents)}</strong>
            <span>pago único</span>
          </div>
          {p.description ? <p className="muted small mb-0">{p.description}</p> : null}
          <ul className="features">
            {p.features.map((f) => (
              <li key={f}>
                <IconCheck />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link href={`/contratar/${p.slug}`} className={`btn ${p.highlighted ? 'btn-primary' : ''} btn-block`}>
            {p.cta_label || `Contratar ${p.name}`} <IconArrow />
          </Link>
        </article>
      ))}
    </div>
  );
}

export function PricingConditions({ note }: { note: string | null }) {
  return (
    <div className="card not-included reveal">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 640 }}>
          <h3 style={{ fontSize: 18, marginBottom: 6 }}>Condiciones de los precios</h3>
          <p className="muted small mb-0">
            {note || 'Los precios son orientativos y corresponden al alcance descrito en cada plan.'} No están incluidos,
            salvo acuerdo expreso:
          </p>
        </div>
        <BookCallButton size="sm" label="¿Dudas? Agenda una llamada" />
      </div>
      <ul>
        {NOT_INCLUDED.map((x) => (
          <li key={x} className="badge">
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MaintenanceCards({ plans }: { plans: MaintenancePlan[] }) {
  if (!plans.length) return null;
  return (
    <div className="grid grid-3">
      {plans.map((m, i) => (
        <article key={m.id} className="card maint-card reveal" style={{ transitionDelay: `${i * 80}ms` }}>
          <h3 style={{ fontSize: 19 }}>{m.name}</h3>
          <div className="price" style={{ marginTop: 10 }}>
            <strong style={{ fontSize: 32 }}>{euros(m.price_cents, { from: m.price_from })}</strong>
            <span>/mes</span>
          </div>
          {m.description ? <p className="muted small">{m.description}</p> : null}
          <ul className="features" style={{ margin: '16px 0 0' }}>
            {m.features.map((f) => (
              <li key={f}>
                <IconCheck />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="meta">
            {m.response_time ? (
              <div className="row" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <IconClock size={16} />
                <span>
                  <b>Tiempo de respuesta:</b> {m.response_time}
                </span>
              </div>
            ) : null}
            {m.limits ? (
              <div className="row" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <IconShield size={16} />
                <span>
                  <b>Límites:</b> {m.limits}
                </span>
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function AddonsList({ addons }: { addons: Addon[] }) {
  if (!addons.length) return null;
  const unit = (a: Addon) => (a.unit === 'monthly' ? '/mes' : a.unit === 'hourly' ? '/hora' : '');
  return (
    <div className="card reveal" style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 18 }}>Servicios adicionales</h3>
      <div className="grid grid-3" style={{ marginTop: 12 }}>
        {addons.map((a) => (
          <div key={a.id}>
            <div style={{ fontWeight: 600 }}>
              {a.name} · <span className="accent">{euros(a.price_cents, { from: a.price_from })}{unit(a)}</span>
            </div>
            {a.description ? <div className="muted small">{a.description}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
