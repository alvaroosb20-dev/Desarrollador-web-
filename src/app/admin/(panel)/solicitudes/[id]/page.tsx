import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { euros, shortDate, whatsappLink } from '@/lib/format';
import { REQUEST_STATUSES } from '@/lib/wizard';
import { isUuid } from '@/lib/validation';
import Flash from '@/components/admin/Flash';
import { addNote, deleteNote, deleteRequest, updateRequestStatus } from '../../../actions';
import { ORDER_LABELS, BOOKING_LABELS } from '@/components/admin/labels';

export const dynamic = 'force-dynamic';

export default async function SolicitudDetalle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const { supabase } = await requireAdmin();

  const { data: r } = await supabase.from('requests_overview').select('*').eq('id', id).maybeSingle();
  if (!r) notFound();

  const [answers, notes, bookings, orders, others] = await Promise.all([
    supabase.from('request_answers').select('*').eq('request_id', id).order('step'),
    supabase.from('private_notes').select('*').eq('request_id', id).order('created_at', { ascending: false }),
    supabase.from('bookings').select('id, starts_at, status, business_timezone, project_summary').or(`request_id.eq.${id},contact_id.eq.${r.contact_id}`).order('starts_at', { ascending: false }),
    supabase.from('orders').select('id, created_at, status, total_cents, package_snapshot').or(`request_id.eq.${id},contact_id.eq.${r.contact_id}`).order('created_at', { ascending: false }),
    supabase.from('requests').select('id, created_at, source').eq('contact_id', r.contact_id).neq('id', id).order('created_at', { ascending: false }),
  ]);
  const wa = whatsappLink(r.contact_phone);

  return (
    <>
      <Link href="/admin/solicitudes" className="small muted">
        ← Solicitudes
      </Link>
      <div className="admin-head" style={{ marginTop: 12 }}>
        <div>
          <h1>{r.contact_name}</h1>
          <p className="muted mb-0">
            {r.business_name ?? 'Sin nombre de negocio'} · recibida el {shortDate(r.created_at)} ·{' '}
            {r.source === 'contact' ? 'formulario de contacto' : r.source === 'checkout' ? 'contratación' : 'formulario inicial'}
          </p>
        </div>
        <form action={updateRequestStatus} className="inline-form">
          <input type="hidden" name="id" value={r.id} />
          <select name="status" className="select" defaultValue={r.status} aria-label="Estado">
            {REQUEST_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm">Cambiar estado</button>
        </form>
      </div>
      <Flash sp={sp} />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', alignItems: 'start' }}>
        <div>
          <section className="admin-card">
            <h2>Contacto</h2>
            <dl className="kv">
              <dt>Correo</dt>
              <dd>
                <a className="link" href={`mailto:${r.contact_email}`}>
                  {r.contact_email}
                </a>
              </dd>
              <dt>Teléfono</dt>
              <dd>
                {r.contact_phone ? (
                  <>
                    <a className="link" href={`tel:${r.contact_phone}`}>
                      {r.contact_phone}
                    </a>
                    {wa ? (
                      <>
                        {' · '}
                        <a className="link" href={wa} target="_blank" rel="noopener noreferrer">
                          WhatsApp
                        </a>
                      </>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Acepta publicidad</dt>
              <dd>{r.marketing_consent ? 'Sí' : 'No'}</dd>
            </dl>
          </section>

          <section className="admin-card">
            <h2>Respuestas del formulario</h2>
            {(answers.data ?? []).length ? (
              <dl className="kv">
                {(answers.data ?? []).map((a: any) => (
                  <div key={a.id} style={{ display: 'contents' }}>
                    <dt>{a.question_label}</dt>
                    <dd>{a.answer_label ?? a.answer_value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            ) : r.message ? (
              <div className="note">{r.message}</div>
            ) : (
              <p className="muted mb-0">Sin respuestas.</p>
            )}
          </section>

          <section className="admin-card">
            <h2>Notas privadas</h2>
            <p className="small muted">Solo las ve el administrador. Nunca se muestran al cliente.</p>
            <form action={addNote} style={{ marginBottom: 16 }}>
              <input type="hidden" name="request_id" value={r.id} />
              <textarea name="body" className="textarea" style={{ minHeight: 90 }} placeholder="Añade una nota…" maxLength={5000} required />
              <button className="btn btn-sm" style={{ marginTop: 8 }}>
                Guardar nota
              </button>
            </form>
            <div className="stack">
              {(notes.data ?? []).map((n: any) => (
                <div key={n.id} className="note">
                  {n.body}
                  <small className="row between">
                    <span>{shortDate(n.created_at)}</span>
                    <form action={deleteNote}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="request_id" value={r.id} />
                      <button className="link" style={{ background: 'none', border: 0, color: 'var(--text-3)', cursor: 'pointer', font: 'inherit' }}>
                        Eliminar
                      </button>
                    </form>
                  </small>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div>
          <section className="admin-card">
            <h2>Llamadas</h2>
            {(bookings.data ?? []).length ? (
              <div className="stack small">
                {(bookings.data ?? []).map((b: any) => (
                  <div key={b.id} className="row between">
                    <span>{shortDate(b.starts_at, b.business_timezone)}</span>
                    <span className="badge">{BOOKING_LABELS[b.status] ?? b.status}</span>
                  </div>
                ))}
                <Link href="/admin/llamadas" className="link">
                  Gestionar llamadas
                </Link>
              </div>
            ) : (
              <p className="muted small mb-0">Sin llamadas agendadas.</p>
            )}
          </section>

          <section className="admin-card">
            <h2>Contrataciones</h2>
            {(orders.data ?? []).length ? (
              <div className="stack small">
                {(orders.data ?? []).map((o: any) => (
                  <div key={o.id} className="row between">
                    <span>
                      {o.package_snapshot?.name} · {euros(o.total_cents)}
                    </span>
                    <span className="badge">{ORDER_LABELS[o.status] ?? o.status}</span>
                  </div>
                ))}
                <Link href="/admin/contrataciones" className="link">
                  Ver contrataciones
                </Link>
              </div>
            ) : (
              <p className="muted small mb-0">Sin contrataciones.</p>
            )}
          </section>

          {(others.data ?? []).length ? (
            <section className="admin-card">
              <h2>Otras solicitudes de este cliente</h2>
              <div className="stack small">
                {(others.data ?? []).map((o: any) => (
                  <Link key={o.id} href={`/admin/solicitudes/${o.id}`} className="link">
                    {shortDate(o.created_at)} · {o.source}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="admin-card danger-zone">
            <h2>Eliminar solicitud</h2>
            <p className="small muted">
              Borra la solicitud, sus respuestas y notas. Las llamadas y contrataciones del cliente se conservan. No se puede deshacer.
            </p>
            <form action={deleteRequest} className="inline-form">
              <input type="hidden" name="id" value={r.id} />
              <input name="confirm" className="input" placeholder="Escribe ELIMINAR" aria-label="Escribe ELIMINAR para confirmar" />
              <button className="btn btn-danger btn-sm">Eliminar</button>
            </form>
          </section>
        </div>
      </div>
      <style>{`@media (max-width: 1000px){.admin-main .grid[style]{grid-template-columns:1fr!important}}`}</style>
    </>
  );
}
