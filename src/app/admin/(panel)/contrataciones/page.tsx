import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { euros, shortDate } from '@/lib/format';
import Flash from '@/components/admin/Flash';
import { ORDER_LABELS, PAYMENT_LABELS } from '@/components/admin/labels';
import { addManualPayment, updateOrderStatus } from '../../actions';

export const dynamic = 'force-dynamic';

const EDITABLE = ['awaiting_quote', 'pending_payment', 'payment_setup_pending', 'in_progress', 'delivered', 'cancelled'];

export default async function Contrataciones({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('orders')
    .select('*, contacts(name, email, phone), payments(id, provider, amount_cents, status, paid_at, stripe_session_id)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Contrataciones</h1>
          <p className="muted mb-0">
            Los pagos online solo se marcan como cobrados cuando Stripe los confirma. Los presupuestos no cuentan como ingresos.
          </p>
        </div>
      </div>
      <Flash sp={sp} />
      {error ? <div className="alert alert-error">{error.message}</div> : null}

      <div className="stack">
        {(data ?? []).map((o: any) => {
          const c = Array.isArray(o.contacts) ? o.contacts[0] : o.contacts;
          const pays: any[] = o.payments ?? [];
          const paid = pays.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount_cents, 0);
          return (
            <article key={o.id} className="admin-card" style={{ marginBottom: 0 }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>
                    {o.package_snapshot?.name} · {euros(o.total_cents)}
                  </div>
                  <div className="small muted">
                    {shortDate(o.created_at)} · {c?.name} · {c?.email}
                    {c?.phone ? ` · ${c.phone}` : ''}
                  </div>
                </div>
                <span
                  className={`badge ${['paid', 'delivered'].includes(o.status) ? 'badge-ok' : ['payment_failed', 'cancelled'].includes(o.status) ? 'badge-danger' : 'badge-warn'}`}
                >
                  {ORDER_LABELS[o.status] ?? o.status}
                </span>
              </div>
              <dl className="kv" style={{ marginTop: 14 }}>
                <dt>Modalidad de pago</dt>
                <dd>{o.payment_mode === 'deposit' ? `Señal (${euros(o.amount_due_now_cents)} al contratar)` : 'Pago completo'}</dd>
                <dt>Cobrado</dt>
                <dd>
                  <strong>{euros(paid)}</strong> de {euros(o.total_cents)}
                  {paid < o.total_cents ? <span className="muted"> · pendiente {euros(o.total_cents - paid)}</span> : null}
                </dd>
                <dt>Mantenimiento</dt>
                <dd>
                  {o.maintenance_snapshot
                    ? `${o.maintenance_snapshot.name} (${euros(o.maintenance_snapshot.price_cents, { from: o.maintenance_snapshot.price_from, monthly: true })})`
                    : 'No'}
                </dd>
                <dt>Requisitos especiales</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{o.requirements || '—'}</dd>
                <dt>Condiciones aceptadas</dt>
                <dd>
                  v{o.terms_version} · {shortDate(o.terms_accepted_at)}
                </dd>
                {o.request_id ? (
                  <>
                    <dt>Solicitud</dt>
                    <dd>
                      <Link className="link" href={`/admin/solicitudes/${o.request_id}`}>
                        Ver solicitud vinculada
                      </Link>
                    </dd>
                  </>
                ) : null}
                <dt>Pagos</dt>
                <dd>
                  {pays.length
                    ? pays.map((p) => (
                        <div key={p.id} className="small">
                          {p.provider === 'manual' ? 'Manual' : 'Stripe'} · {euros(p.amount_cents)} · {PAYMENT_LABELS[p.status] ?? p.status}
                          {p.paid_at ? ` · ${shortDate(p.paid_at)}` : ''}
                        </div>
                      ))
                    : '—'}
                </dd>
              </dl>
              <div className="row" style={{ marginTop: 16, alignItems: 'flex-start' }}>
                <form action={updateOrderStatus} className="inline-form">
                  <input type="hidden" name="id" value={o.id} />
                  <select name="status" className="select" defaultValue={EDITABLE.includes(o.status) ? o.status : ''} aria-label="Estado">
                    {!EDITABLE.includes(o.status) ? (
                      <option value="" disabled>
                        {ORDER_LABELS[o.status]}
                      </option>
                    ) : null}
                    {EDITABLE.map((s) => (
                      <option key={s} value={s}>
                        {ORDER_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-sm">Cambiar estado</button>
                </form>
                {paid < o.total_cents && o.status !== 'cancelled' ? (
                  <details className="edit">
                    <summary className="btn btn-sm">Registrar pago manual</summary>
                    <form action={addManualPayment} className="inline-form" style={{ marginTop: 8 }}>
                      <input type="hidden" name="id" value={o.id} />
                      <input name="amount" className="input" placeholder="Importe, p. ej. 125,00" inputMode="decimal" required />
                      <label className="check" style={{ margin: 0 }}>
                        <input type="checkbox" name="confirm" required />
                        <span>He recibido este cobro (transferencia, Bizum…)</span>
                      </label>
                      <button className="btn btn-primary btn-sm">Registrar</button>
                    </form>
                  </details>
                ) : null}
              </div>
            </article>
          );
        })}
        {!(data ?? []).length ? <p className="muted">Todavía no hay contrataciones.</p> : null}
      </div>
    </>
  );
}
