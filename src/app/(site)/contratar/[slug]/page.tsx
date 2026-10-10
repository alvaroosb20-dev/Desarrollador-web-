import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import CheckoutForm from '@/components/CheckoutForm';
import { IconCheck } from '@/components/Icons';
import { getMaintenancePlans, getPackageBySlug, getSettings } from '@/lib/settings';
import { integrations } from '@/lib/env';
import { euros } from '@/lib/format';
import { LEAD_COOKIE, verifyLead } from '@/lib/lead-cookie';
import { serviceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pkg = await getPackageBySlug(slug);
  return pkg
    ? { title: `Contratar ${pkg.name}`, description: pkg.description ?? undefined, alternates: { canonical: `/contratar/${slug}` } }
    : { title: 'Plan no encontrado' };
}

async function prefill() {
  try {
    const store = await cookies();
    const id = await verifyLead(store.get(LEAD_COOKIE)?.value);
    if (!id) return null;
    const { data } = await serviceClient().from('requests').select('contacts(name, email, phone)').eq('id', id).maybeSingle();
    const c: any = data ? (Array.isArray(data.contacts) ? data.contacts[0] : data.contacts) : null;
    return c ? { name: c.name ?? '', email: c.email ?? '', phone: c.phone ?? '' } : null;
  } catch {
    return null;
  }
}

export default async function ContratarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cancelado?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const [pkg, plans, s, pre] = await Promise.all([getPackageBySlug(slug), getMaintenancePlans(), getSettings(), prefill()]);
  if (!pkg) notFound();

  return (
    <div className="container page-pad">
      <Link href="/#planes" className="small muted">
        ← Volver a los planes
      </Link>
      <div className="section-head" style={{ marginTop: 20, marginBottom: 32 }}>
        <span className="eyebrow">Contratación</span>
        <h1 style={{ fontSize: 'clamp(32px,5vw,52px)' }}>
          {pkg.name} · <span className="serif accent">{euros(pkg.price_cents)}</span>
        </h1>
        {pkg.audience ? <p>{pkg.audience}</p> : null}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20 }}>Qué incluye</h2>
        <ul className="features" style={{ margin: '8px 0 0', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', display: 'grid' }}>
          {pkg.features.map((f) => (
            <li key={f}>
              <IconCheck />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 16, marginBottom: 0 }}>
          {pkg.page_limit ? `Límite: ${pkg.page_limit} páginas. ` : ''}
          {pkg.revision_rounds} {pkg.revision_rounds === 1 ? 'ronda' : 'rondas'} de modificaciones. Precio orientativo para el alcance descrito.
        </p>
      </div>

      <CheckoutForm
        pkg={{ slug: pkg.slug, name: pkg.name, price_cents: pkg.price_cents }}
        plans={plans.map((p) => ({ slug: p.slug, name: p.name, price_cents: p.price_cents, price_from: p.price_from, limits: p.limits }))}
        paymentMode={s.payment_mode}
        depositPercent={s.deposit_percent}
        stripeReady={integrations.stripe()}
        prefill={pre}
        cancelled={sp.cancelado === '1'}
      />
    </div>
  );
}
