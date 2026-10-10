import Link from 'next/link';
import BookCallButton from '@/components/BookCallButton';
import ContactForm from '@/components/ContactForm';
import DemoMockup from '@/components/DemoMockup';
import AskInfoButton from '@/components/AskInfoButton';
import { AddonsList, MaintenanceCards, PricingCards, PricingConditions } from '@/components/Pricing';
import { IconArrow, IconMail, IconWhatsapp, SERVICE_ICONS, IconLayout } from '@/components/Icons';
import { getAddons, getDemos, getFaqs, getMaintenancePlans, getPackages, getSettings } from '@/lib/settings';
import { euros, whatsappLink } from '@/lib/format';

export const revalidate = 300;

const DEFAULT_SERVICES = [
  { key: 'diseno', title: 'Diseño de páginas web', description: 'Webs corporativas modernas, rápidas y pensadas para que te contacten.' },
  { key: 'tiendas', title: 'Tiendas online', description: 'Catálogo, carrito y pagos seguros para vender desde el primer día.' },
  { key: 'landing', title: 'Landing pages', description: 'Una página enfocada en un único objetivo.' },
  { key: 'renovacion', title: 'Renovación de páginas web', description: 'Modernizamos tu web actual.' },
  { key: 'reservas', title: 'Páginas de reservas', description: 'Tus clientes eligen día y hora.' },
  { key: 'mantenimiento', title: 'Mantenimiento web', description: 'Revisiones y pequeños cambios con límites claros.' },
];

const DEFAULT_STEPS = [
  { title: 'Nos cuentas tu idea', description: '' },
  { title: 'Analizamos las necesidades de tu negocio', description: '' },
  { title: 'Diseñamos tu página web', description: '' },
  { title: 'Revisamos contigo el resultado', description: '' },
  { title: 'Publicamos la web después de tu aprobación', description: '' },
];

export default async function HomePage() {
  const [s, packages, plans, addons, faqs, demos] = await Promise.all([
    getSettings(),
    getPackages(),
    getMaintenancePlans(),
    getAddons(),
    getFaqs(),
    getDemos(),
  ]);
  const services = s.services.length ? s.services : DEFAULT_SERVICES;
  const steps = s.process_steps.length ? s.process_steps : DEFAULT_STEPS;
  const wa = whatsappLink(s.whatsapp, `Hola, me interesa una página web para mi negocio.`);
  const minPrice = packages.length ? Math.min(...packages.map((p) => p.price_cents)) : null;

  const faqJsonLd = faqs.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
      }
    : null;

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-grid" aria-hidden="true" />
        <div className="container">
          <div className="hero-inner">
            <span className="eyebrow">Diseño y desarrollo web</span>
            <h1 id="hero-title">{renderTitle(s.hero_title)}</h1>
            <p className="lead">{s.hero_subtitle}</p>
            <div className="hero-cta">
              <Link href="/empezar" className="btn btn-primary">
                Crear mi página web <IconArrow />
              </Link>
              <a href="#planes" className="btn">
                Ver nuestros planes
              </a>
              <BookCallButton />
            </div>
            <div className="hero-meta">
              {minPrice !== null ? (
                <div>
                  <strong>Desde {euros(minPrice)}</strong>
                  Precio cerrado por plan
                </div>
              ) : null}
              <div>
                <strong>Diseño a medida</strong>
                Nada de plantillas genéricas
              </div>
              <div>
                <strong>Tu aprobación primero</strong>
                Publicamos cuando tú lo dices
              </div>
              <div>
                <strong>Adaptada a móvil</strong>
                Rápida en cualquier pantalla
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ---------- Servicios ---------- */}
      <section id="servicios" className="section" aria-labelledby="servicios-title">
        <div className="container">
          <div className="section-head reveal">
            <span className="eyebrow">Servicios</span>
            <h2 id="servicios-title">
              Todo lo que tu negocio necesita <span className="serif accent">en Internet</span>
            </h2>
            <p>Diseñamos cada web pensando en un objetivo concreto: que te encuentren, te contacten y te compren.</p>
          </div>
          <div className="grid grid-3">
            {services.map((sv, i) => {
              const Icon = SERVICE_ICONS[sv.key] ?? IconLayout;
              return (
                <article key={sv.key || sv.title} className="card card-hover service-card reveal" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                  <div className="icon-wrap">
                    <Icon />
                  </div>
                  <h3>{sv.title}</h3>
                  <p>{sv.description}</p>
                  <AskInfoButton topic={sv.title} />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Cómo trabajamos ---------- */}
      <section id="proceso" className="section" style={{ paddingTop: 0 }} aria-labelledby="proceso-title">
        <div className="container">
          <div className="section-head reveal">
            <span className="eyebrow">Cómo trabajamos</span>
            <h2 id="proceso-title">
              Un proceso claro, <span className="serif accent">sin sorpresas</span>
            </h2>
            <p>Sabes en todo momento en qué punto está tu web y qué viene después.</p>
          </div>
          <ol className="steps reveal" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {steps.map((st, i) => (
              <li key={st.title} className="step">
                <div className="step-num">{String(i + 1).padStart(2, '0')}</div>
                <h3>{st.title}</h3>
                {st.description ? <p>{st.description}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Proyectos ---------- */}
      {demos.length ? (
        <section id="proyectos" className="section" style={{ paddingTop: 0 }} aria-labelledby="proyectos-title">
          <div className="container">
            <div className="section-head reveal">
              <span className="eyebrow">Proyectos de demostración</span>
              <h2 id="proyectos-title">
                Ideas de diseño para <span className="serif accent">cada sector</span>
              </h2>
              <p>
                Estos diseños son demostraciones creadas por nosotros para mostrar distintos estilos. No corresponden a
                clientes reales.
              </p>
            </div>
            <div className="grid grid-4">
              {demos.map((d, i) => (
                <article key={d.id} className="card card-hover demo-card reveal" style={{ transitionDelay: `${(i % 4) * 60}ms` }}>
                  <DemoMockup demo={d} />
                  <div className="demo-body">
                    <div className="demo-tag">
                      <span className="badge">Demo</span>
                      <span>{d.sector}</span>
                    </div>
                    <h3>{d.title}</h3>
                    {d.description ? <p>{d.description}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <hr className="divider" />

      {/* ---------- Planes ---------- */}
      <section id="planes" className="section" aria-labelledby="planes-title">
        <div className="container">
          <div className="section-head reveal">
            <span className="eyebrow">Planes y precios</span>
            <h2 id="planes-title">
              Elige el plan que <span className="serif accent">encaja contigo</span>
            </h2>
            <p>Precio cerrado para el alcance descrito. Si necesitas algo más, te lo presupuestamos antes de empezar.</p>
          </div>
          <PricingCards packages={packages} />
          <PricingConditions note={s.pricing_note} />
          <AddonsList addons={addons} />
        </div>
      </section>

      {/* ---------- Mantenimiento ---------- */}
      {plans.length ? (
        <section id="mantenimiento" className="section" style={{ paddingTop: 0 }} aria-labelledby="mant-title">
          <div className="container">
            <div className="section-head reveal">
              <span className="eyebrow">Mantenimiento opcional</span>
              <h2 id="mant-title">
                Tu web, siempre <span className="serif accent">a punto</span>
              </h2>
              <p>
                Planes mensuales con tareas, tiempos de respuesta y límites claros. No ofrecemos mantenimiento ilimitado:
                preferimos que sepas exactamente qué incluye. Puedes añadirlo al contratar o más adelante.
              </p>
            </div>
            <MaintenanceCards plans={plans} />
            <div className="row reveal" style={{ marginTop: 24 }}>
              <a href="#contacto" className="btn btn-sm">
                Solicitar mantenimiento para mi web
              </a>
            </div>
          </div>
        </section>
      ) : null}

      <hr className="divider" />

      {/* ---------- FAQ ---------- */}
      {faqs.length ? (
        <section id="faq" className="section" aria-labelledby="faq-title">
          <div className="container" style={{ display: 'grid', gap: 48, gridTemplateColumns: 'minmax(0,1fr)' }}>
            <div className="section-head reveal" style={{ marginBottom: 0 }}>
              <span className="eyebrow">Preguntas frecuentes</span>
              <h2 id="faq-title">Lo que más nos preguntan</h2>
            </div>
            <div className="faq reveal">
              {faqs.map((f) => (
                <details key={f.id}>
                  <summary>{f.question}</summary>
                  <div className="answer">{f.answer}</div>
                </details>
              ))}
            </div>
          </div>
          {faqJsonLd ? (
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }} />
          ) : null}
        </section>
      ) : null}

      {/* ---------- Contacto ---------- */}
      <section id="contacto" className="section" style={{ paddingTop: faqs.length ? 0 : undefined }} aria-labelledby="contacto-title">
        <div className="container contact-grid">
          <div className="reveal">
            <span className="eyebrow">Contacto</span>
            <h2 id="contacto-title" style={{ fontSize: 'clamp(32px,4.6vw,52px)' }}>
              Hablemos de <span className="serif accent">tu proyecto</span>
            </h2>
            <p className="muted" style={{ fontSize: 18 }}>
              Escríbenos o agenda una llamada de 15 minutos. Sin compromiso.
            </p>
            <div className="contact-list">
              {s.contact_email ? (
                <a className="contact-item" href={`mailto:${s.contact_email}`}>
                  <IconMail className="icon" />
                  <span>{s.contact_email}</span>
                </a>
              ) : null}
              {wa ? (
                <a className="contact-item" href={wa} target="_blank" rel="noopener noreferrer">
                  <IconWhatsapp className="icon" />
                  <span>Escríbenos por WhatsApp</span>
                </a>
              ) : null}
              <BookCallButton block />
            </div>
          </div>
          <div className="reveal">
            <ContactForm topics={services.map((x) => x.title)} />
          </div>
        </div>
      </section>
    </>
  );
}

/** Pone en cursiva serif las últimas palabras del título para el acento visual. */
function renderTitle(title: string) {
  const words = title.trim().split(/\s+/);
  if (words.length < 4) return title;
  const tail = words.slice(-2).join(' ');
  return (
    <>
      {words.slice(0, -2).join(' ')} <span className="serif accent">{tail}</span>
    </>
  );
}
