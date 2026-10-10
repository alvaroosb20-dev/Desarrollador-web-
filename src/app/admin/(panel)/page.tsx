import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { euros, shortDate } from '@/lib/format';
import { integrations } from '@/lib/env';
import { REQUEST_STATUSES, WEBSITE_TYPES, labelOf } from '@/lib/wizard';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const { supabase } = await requireAdmin();
  const nowIso = new Date().toISOString();

  const count = async (table: string, f?: (q: any) => any) => {
    let q: any = supabase.from(table).select('id', { count: 'exact', head: true });
    if (f) q = f(q);
    const { count } = await q;
    return count ?? 0;
  };

  const [total, nuevas, presupuestos, aceptadas, pendientes, realizadas, contrataciones, payments, openOrders, latest, upcoming, bookingCfg] =
    await Promise.all([
      count('requests'),
      count('requests', (q) => q.eq('status', 'nueva')),
      count('requests', (q) => q.eq('status', 'presupuesto_enviado')),
      count('requests', (q) => q.in('status', ['aceptada', 'en_desarrollo', 'entregada'])),
      count('bookings', (q) => q.eq('status', 'confirmed').gte('starts_at', nowIso)),
      count('bookings', (q) => q.eq('status', 'completed')),
      count('orders', (q) => q.not('status', 'in', '(cancelled,payment_failed)')),
      supabase.from('payments').select('amount_cents, status'),
      supabase.from('orders').select('total_cents, status').in('status', ['awaiting_quote', 'pending_payment', 'payment_setup_pending', 'deposit_paid', 'in_progress', 'delivered', 'paid']),
      supabase.from('requests_overview').select('id, created_at, contact_name, business_name, website_type, status').order('created_at', { ascending: false }).limit(6),
      supabase.from('bookings').select('id, starts_at, name, project_summary, business_timezone').eq('status', 'confirmed').gte('starts_at', nowIso).order('starts_at').limit(6),
      supabase.from('booking_settings').select('enabled').eq('id', 1).maybeSingle(),
    ]);

  const paidCents = (payments.data ?? []).filter((p: any) => p.status === 'paid').reduce((a: number, p: any) => a + p.amount_cents, 0);
  const pendingPayCents = (payments.data ?? []).filter((p: any) => p.status === 'pending').reduce((a: number, p: any) => a + p.amount_cents, 0);
  // Pendiente de cobro = total de contrataciones activas − lo ya cobrado de ellas (aprox. a nivel global)
  const contractedCents = (openOrders.data ?? []).reduce((a: number, o: any) => a + o.total_cents, 0);
  const outstanding = Math.max(0, contractedCents - paidCents);

  const warnings: string[] = [];
  if (!integrations.email()) warnings.push('El correo no está configurado: no se envían confirmaciones ni avisos.');
  if (!integrations.stripe()) warnings.push('Stripe no está configurado: la contratación se registra sin cobro online.');
  if (!bookingCfg.data?.enabled) warnings.push('Las reservas online están desactivadas. Actívalas en Disponibilidad.');
  if (!integrations.leadSecret()) warnings.push('Falta LEAD_COOKIE_SECRET (se está usando una clave de respaldo).');

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Resumen</h1>
          <p className="muted mb-0">Estado de tu negocio de un vistazo.</p>
        </div>
        <Link href="/admin/solicitudes" className="btn btn-sm">
          Ver solicitudes
        </Link>
      </div>

      {warnings.length ? (
        <div className="alert alert-warn">
          <strong>Pendiente de configurar:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <Link href="/admin/integraciones" className="link small">
            Ver instrucciones
          </Link>
        </div>
      ) : null}

      <div className="stat-grid">
        <Stat k="Solicitudes recibidas" v={total} />
        <Stat k="Solicitudes nuevas" v={nuevas} />
        <Stat k="Presupuestos enviados" v={presupuestos} />
        <Stat k="Clientes que han aceptado" v={aceptadas} />
        <Stat k="Llamadas pendientes" v={pendientes} />
        <Stat k="Llamadas realizadas" v={realizadas} />
        <Stat k="Contrataciones" v={contrataciones} />
        <Stat k="Ingresos cobrados" v={euros(paidCents)} s="Solo pagos confirmados" />
      </div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <Stat k="Pendiente de cobro" v={euros(outstanding)} s="Contrataciones activas aún no cobradas (no son ingresos)" />
        <Stat k="Pagos en curso en Stripe" v={euros(pendingPayCents)} s="Sesiones abiertas sin confirmar" />
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="admin-card">
          <h2>Últimas solicitudes</h2>
          {(latest.data ?? []).length ? (
            <div className="stack">
              {(latest.data ?? []).map((r: any) => (
                <Link key={r.id} href={`/admin/solicitudes/${r.id}`} className="row between" style={{ gap: 8 }}>
                  <span>
                    <strong>{r.contact_name}</strong>
                    <span className="muted small"> · {r.business_name ?? labelOf(WEBSITE_TYPES, r.website_type)}</span>
                  </span>
                  <span className="badge">{labelOf(REQUEST_STATUSES, r.status)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted mb-0">Todavía no hay solicitudes.</p>
          )}
        </section>
        <section className="admin-card">
          <h2>Próximas llamadas</h2>
          {(upcoming.data ?? []).length ? (
            <div className="stack">
              {(upcoming.data ?? []).map((b: any) => (
                <div key={b.id} className="row between" style={{ gap: 8 }}>
                  <span>
                    <strong>{b.name}</strong>
                    <span className="muted small"> · {b.project_summary?.slice(0, 50) ?? ''}</span>
                  </span>
                  <span className="small">{shortDate(b.starts_at, b.business_timezone)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted mb-0">No hay llamadas próximas.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ k, v, s }: { k: string; v: number | string; s?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s ? <div className="s">{s}</div> : null}
    </div>
  );
}
