// Filtros compartidos por el listado de solicitudes y la exportación CSV.
import { BUDGETS, REQUEST_STATUSES, WEBSITE_TYPES, has } from './wizard';

export type RequestFilters = {
  q: string;
  status: string;
  budget: string;
  service: string;
  from: string;
  to: string;
  source: string;
};

type Params = { get(name: string): string | null };

export function parseRequestFilters(sp: Params): RequestFilters {
  const get = (k: string) => (sp.get(k) ?? '').trim();
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  return {
    q: get('q').slice(0, 100),
    status: has(REQUEST_STATUSES, get('estado')) ? get('estado') : '',
    budget: has(BUDGETS, get('presupuesto')) ? get('presupuesto') : '',
    service: has(WEBSITE_TYPES, get('servicio')) ? get('servicio') : '',
    from: date(get('desde')),
    to: date(get('hasta')),
    source: ['wizard', 'contact', 'checkout'].includes(get('origen')) ? get('origen') : '',
  };
}

export function filtersToQuery(f: RequestFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.status) p.set('estado', f.status);
  if (f.budget) p.set('presupuesto', f.budget);
  if (f.service) p.set('servicio', f.service);
  if (f.from) p.set('desde', f.from);
  if (f.to) p.set('hasta', f.to);
  if (f.source) p.set('origen', f.source);
  return p.toString();
}

/** Aplica filtros a una consulta sobre la vista `requests_overview`. */
export function applyRequestFilters<Q extends { eq: any; gte: any; lt: any; or: any }>(query: Q, f: RequestFilters): Q {
  let q: any = query;
  if (f.status) q = q.eq('status', f.status);
  if (f.budget) q = q.eq('budget', f.budget);
  if (f.service) q = q.eq('website_type', f.service);
  if (f.source) q = q.eq('source', f.source);
  if (f.from) q = q.gte('created_at', `${f.from}T00:00:00Z`);
  if (f.to) {
    const d = new Date(`${f.to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    q = q.lt('created_at', d.toISOString());
  }
  if (f.q) {
    // caracteres que romperían la sintaxis de filtros de PostgREST
    const term = f.q.replace(/[%,()*\\]/g, ' ').trim();
    if (term) {
      q = q.or(`contact_name.ilike.%${term}%,contact_email.ilike.%${term}%,business_name.ilike.%${term}%`);
    }
  }
  return q;
}
