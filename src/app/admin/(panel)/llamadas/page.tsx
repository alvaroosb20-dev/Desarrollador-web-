import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { formatDateTime, zonedParts, ymdToString } from '@/lib/time';
import Flash from '@/components/admin/Flash';
import { BOOKING_LABELS, EMAIL_LABELS } from '@/components/admin/labels';
import { adminReschedule, setBookingStatus } from '../../actions';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'proximas', label: 'Próximas' },
  { key: 'pasadas', label: 'Pasadas' },
  { key: 'canceladas', label: 'Canceladas' },
];

export default async function Llamadas({ searchParams }: { searchParams: Promise<{ v?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.v) ? sp.v! : 'proximas';
  const { supabase } = await requireAdmin();
  const now = new Date().toISOString();

  let q: any = supabase
    .from('bookings')
    .select('id, starts_at, ends_at, status, name, email, phone, project_summary, request_id, business_timezone, visitor_timezone, email_status, cancel_reason')
    .limit(200);
  if (tab === 'proximas') q = q.eq('status', 'confirmed').gte('starts_at', now).order('starts_at');
  if (tab === 'pasadas') q = q.neq('status', 'cancelled').lt('starts_at', now).order('starts_at', { ascending: false });
  if (tab === 'canceladas') q = q.eq('status', 'cancelled').order('starts_at', { ascending: false });
  const { data, error } = await q;

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Llamadas agendadas</h1>
          <p className="muted mb-0">Las horas se muestran en la zona horaria del negocio.</p>
        </div>
        <Link href="/admin/disponibilidad" className="btn btn-sm">
          Configurar disponibilidad
        </Link>
      </div>
      <Flash sp={sp} />
      <div className="row" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/llamadas?v=${t.key}`} className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}>
            {t.label}
          </Link>
        ))}
      </div>
      {error ? <div className="alert alert-error">{error.message}</div> : null}

      <div className="stack">
        {(data ?? []).map((b: any) => {
          const p = zonedParts(new Date(b.starts_at), b.business_timezone);
          const date = ymdToString({ y: p.y, m: p.m, d: p.d });
          const time = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
          const ret = `/admin/llamadas?v=${tab}`;
          return (
            <article key={b.id} className="admin-card" style={{ marginBottom: 0 }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600, textTransform: 'capitalize' }}>{formatDateTime(b.starts_at, b.business_timezone)}</div>
                  <div className="small muted">
                    {b.business_timezone}
                    {b.visitor_timezone && b.visitor_timezone !== b.business_timezone ? ` · el cliente está en ${b.visitor_timezone}` : ''}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className={`badge ${b.status === 'completed' ? 'badge-ok' : b.status === 'cancelled' ? 'badge-danger' : ''}`}>
                    {BOOKING_LABELS[b.status]}
                  </span>
                  <span className={`badge ${b.email_status === 'sent' ? '' : 'badge-warn'}`} title="Correo de confirmación al cliente">
                    ✉ {EMAIL_LABELS[b.email_status] ?? b.email_status}
                  </span>
                </div>
              </div>
              <dl className="kv" style={{ marginTop: 14 }}>
                <dt>Cliente</dt>
                <dd>
                  {b.name} ·{' '}
                  <a className="link" href={`mailto:${b.email}`}>
                    {b.email}
                  </a>
                  {b.phone ? (
                    <>
                      {' · '}
                      <a className="link" href={`tel:${b.phone}`}>
                        {b.phone}
                      </a>
                    </>
                  ) : null}
                </dd>
                <dt>Motivo / proyecto</dt>
                <dd>{b.project_summary || '—'}</dd>
                <dt>Solicitud</dt>
                <dd>
                  {b.request_id ? (
                    <Link className="link" href={`/admin/solicitudes/${b.request_id}`}>
                      Ver solicitud vinculada
                    </Link>
                  ) : (
                    'Sin formulario previo'
                  )}
                </dd>
                {b.cancel_reason ? (
                  <>
                    <dt>Motivo de cancelación</dt>
                    <dd>{b.cancel_reason}</dd>
                  </>
                ) : null}
              </dl>

              {b.status !== 'cancelled' ? (
                <div className="row" style={{ marginTop: 16, alignItems: 'flex-start' }}>
                  <form action={setBookingStatus} className="inline-form">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="return" value={ret} />
                    <input type="hidden" name="status" value={b.status === 'completed' ? 'confirmed' : 'completed'} />
                    <button className="btn btn-sm">{b.status === 'completed' ? 'Marcar como pendiente' : 'Marcar como realizada'}</button>
                  </form>
                  {b.status === 'confirmed' ? (
                    <>
                      <details className="edit">
                        <summary className="btn btn-sm">Cambiar fecha u hora</summary>
                        <form action={adminReschedule} className="inline-form" style={{ marginTop: 8 }}>
                          <input type="hidden" name="id" value={b.id} />
                          <input type="date" name="date" className="input" defaultValue={date} required aria-label="Nueva fecha" />
                          <input type="time" name="time" className="input" defaultValue={time} step={300} required aria-label="Nueva hora" />
                          <button className="btn btn-primary btn-sm">Guardar y avisar</button>
                        </form>
                      </details>
                      <details className="edit">
                        <summary className="btn btn-sm btn-danger">Cancelar</summary>
                        <form action={setBookingStatus} className="inline-form" style={{ marginTop: 8 }}>
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="return" value={ret} />
                          <input type="hidden" name="status" value="cancelled" />
                          <input name="reason" className="input" placeholder="Motivo (se envía al cliente)" maxLength={300} />
                          <button className="btn btn-danger btn-sm">Confirmar cancelación</button>
                        </form>
                      </details>
                    </>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {!(data ?? []).length ? <p className="muted">No hay llamadas en esta vista.</p> : null}
      </div>
    </>
  );
}
