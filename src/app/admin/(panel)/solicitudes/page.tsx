import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { shortDate } from '@/lib/format';
import { applyRequestFilters, filtersToQuery, parseRequestFilters } from '@/lib/request-filters';
import { BUDGETS, REQUEST_STATUSES, WEBSITE_TYPES, labelOf } from '@/lib/wizard';
import Flash from '@/components/admin/Flash';
import { updateRequestStatus } from '../../actions';

export const dynamic = 'force-dynamic';
const PAGE = 25;

type SP = Record<string, string | undefined>;

export default async function Solicitudes({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const f = parseRequestFilters({ get: (k: string) => sp[k] ?? null });
  const page = Math.max(1, Number(sp.p) || 1);

  let q: any = supabase
    .from('requests_overview')
    .select('id, created_at, status, source, business_name, website_type, budget, contact_name, contact_email, contact_phone, bookings_count, orders_count', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  q = applyRequestFilters(q, f);
  const { data, count, error } = await q;
  const qs = filtersToQuery(f);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const returnTo = `/admin/solicitudes?${qs}${page > 1 ? `&p=${page}` : ''}`;

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Solicitudes</h1>
          <p className="muted mb-0">{count ?? 0} resultados</p>
        </div>
        <a href={`/api/admin/export?${qs}`} className="btn btn-sm">
          Exportar a CSV
        </a>
      </div>
      <Flash sp={sp} />
      {error ? <div className="alert alert-error">No se pudieron cargar las solicitudes: {error.message}</div> : null}

      <form className="filters" method="get" role="search">
        <div>
          <label className="label" htmlFor="f-q">Buscar</label>
          <input id="f-q" name="q" className="input" placeholder="Nombre, correo o empresa" defaultValue={f.q} />
        </div>
        <Sel id="estado" label="Estado" value={f.status} options={REQUEST_STATUSES} />
        <Sel id="servicio" label="Servicio" value={f.service} options={WEBSITE_TYPES} />
        <Sel id="presupuesto" label="Presupuesto" value={f.budget} options={BUDGETS} />
        <div>
          <label className="label" htmlFor="f-desde">Desde</label>
          <input id="f-desde" type="date" name="desde" className="input" defaultValue={f.from} />
        </div>
        <div>
          <label className="label" htmlFor="f-hasta">Hasta</label>
          <input id="f-hasta" type="date" name="hasta" className="input" defaultValue={f.to} />
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-primary btn-sm">Filtrar</button>
          {qs ? (
            <Link href="/admin/solicitudes" className="btn btn-ghost btn-sm">
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Negocio / servicio</th>
              <th>Presupuesto</th>
              <th>Vínculos</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any) => (
              <tr key={r.id}>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>
                  {shortDate(r.created_at)}
                </td>
                <td>
                  <Link className="rowlink" href={`/admin/solicitudes/${r.id}`}>
                    {r.contact_name}
                  </Link>
                  <div className="small muted">{r.contact_email}</div>
                  {r.contact_phone ? <div className="small muted">{r.contact_phone}</div> : null}
                </td>
                <td>
                  <div>{r.business_name ?? <span className="muted">—</span>}</div>
                  <div className="small muted">
                    {r.source === 'contact' ? 'Formulario de contacto' : labelOf(WEBSITE_TYPES, r.website_type)}
                  </div>
                </td>
                <td className="small">{labelOf(BUDGETS, r.budget)}</td>
                <td className="small">
                  {r.bookings_count ? <span className="badge">📞 {r.bookings_count}</span> : null}{' '}
                  {r.orders_count ? <span className="badge">🧾 {r.orders_count}</span> : null}
                </td>
                <td>
                  <form action={updateRequestStatus} className="inline-form">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="return" value={returnTo} />
                    <select name="status" className="select" defaultValue={r.status} aria-label="Estado">
                      {REQUEST_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-sm">Guardar</button>
                  </form>
                </td>
              </tr>
            ))}
            {!(data ?? []).length ? (
              <tr>
                <td colSpan={6} className="muted center" style={{ padding: 32 }}>
                  No hay solicitudes con estos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="pager">
          {page > 1 ? (
            <Link className="btn btn-sm" href={`/admin/solicitudes?${qs}&p=${page - 1}`}>
              ← Anterior
            </Link>
          ) : null}
          <span className="small muted" style={{ alignSelf: 'center' }}>
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link className="btn btn-sm" href={`/admin/solicitudes?${qs}&p=${page + 1}`}>
              Siguiente →
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Sel({ id, label, value, options }: { id: string; label: string; value: string; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="label" htmlFor={`f-${id}`}>
        {label}
      </label>
      <select id={`f-${id}`} name={id} className="select" defaultValue={value}>
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
