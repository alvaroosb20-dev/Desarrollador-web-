// Cliente mínimo de la API REST de Supabase (PostgREST) con la clave de servicio.
// Solo se usa en el servidor: la clave service_role nunca llega al navegador.

const getEnv = (n) => (globalThis.Deno ? Deno.env.get(n) : globalThis.process?.env?.[n]) ?? '';

function base() {
  const url = getEnv('SUPABASE_URL').replace(/\/+$/, '');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las Edge Functions.');
  return { url, key };
}

async function request(method, path, { body, prefer, single = false } = {}) {
  const { url, key } = base();
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Las claves antiguas son JWT; las nuevas (sb_secret_…) solo van en apikey.
  if (key.split('.').length === 3) headers.Authorization = `Bearer ${key}`;
  if (prefer) headers.Prefer = prefer;
  if (single) headers.Accept = 'application/vnd.pgrst.object+json';
  let res;
  try {
    res = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    return { data: null, error: { code: 'network', message: String(e), status: 0 } };
  }
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    // 406 con objeto único = ninguna fila
    if (single && res.status === 406) return { data: null, error: null };
    return {
      data: null,
      error: { code: parsed?.code ?? String(res.status), message: parsed?.message ?? text, status: res.status },
    };
  }
  return { data: parsed, error: null };
}

export const q = encodeURIComponent;

/** select('bookings', 'select=id&status=neq.cancelled') */
export const select = (table, query = 'select=*') => request('GET', `${table}?${query}`);
export const selectOne = (table, query = 'select=*') => request('GET', `${table}?${query}`, { single: true });
export const insert = (table, rows, returning = true) =>
  request('POST', table, { body: rows, prefer: returning ? 'return=representation' : 'return=minimal' });
export const update = (table, filter, patch, returning = false) =>
  request('PATCH', `${table}?${filter}`, { body: patch, prefer: returning ? 'return=representation' : 'return=minimal' });
export const remove = (table, filter) => request('DELETE', `${table}?${filter}`, { prefer: 'return=minimal' });
export const rpc = (fn, args = {}) => request('POST', `rpc/${fn}`, { body: args });

/** Lanza si hay error; devuelve los datos. */
export function must({ data, error }, what = 'la operación') {
  if (error) {
    const err = new Error(`Error en ${what}: ${error.message}`);
    err.code = error.code;
    err.dbMessage = error.message;
    throw err;
  }
  return data;
}
