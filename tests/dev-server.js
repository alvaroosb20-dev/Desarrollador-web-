// Entorno local de pruebas que imita a Supabase (NO se publica ni se usa en producción).
//   :54321  /rest/v1 → PostgREST · /auth/v1 → auth de prueba · /storage/v1 → almacenamiento en memoria
//           /functions/v1/<nombre> → Edge Functions reales (handler.js)
//           /fake-stripe/v1, /fake-resend → imitaciones de Stripe y Resend para probar sin cobrar ni enviar
//   :8080   web estática (carpeta public/)
// Uso: deno run -A tests/dev-server.js   (ver tests/run-stack.sh)
const ROOT = new URL('..', import.meta.url).pathname;
const JWT_SECRET = Deno.env.get('JWT_SECRET');
const PGRST = 'http://127.0.0.1:3000';
const enc = new TextEncoder();

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlStr = (s) => b64url(enc.encode(s));
async function hmacKey() {
  return crypto.subtle.importKey('raw', enc.encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signJwt(payload) {
  const head = b64urlStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlStr(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}
async function verifyJwt(token) {
  const [h, b, s] = String(token).split('.');
  if (!s) return null;
  const expected = b64url(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(`${h}.${b}`)));
  if (expected !== s) return null;
  const p = JSON.parse(atob(b.replace(/-/g, '+').replace(/_/g, '/')));
  if (p.exp && p.exp < Date.now() / 1000) return null;
  return p;
}

// Usuarios de prueba: "id:correo:contraseña" separados por comas
const USERS = (Deno.env.get('TEST_USERS') ?? '').split(',').filter(Boolean).map((u) => {
  const [id, email, password] = u.split(':');
  return { id, email, password };
});

const fakeStripeSessions = new Map();
export const sentEmails = [];
const storage = new Map();

async function issue(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = await signJwt({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp });
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `r-${user.id}`, user: { id: user.id, email: user.email } };
}

const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...cors, ...h } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer, accept, x-upsert, range',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'content-range',
};

const handlers = {};
for (const name of ['forms', 'booking', 'checkout', 'stripe-webhook', 'admin', 'calendar-feed']) {
  handlers[name] = (await import(`${ROOT}supabase/functions/${name}/handler.js`)).default;
}

async function gateway(req) {
  const url = new URL(req.url);
  const p = url.pathname;

  if (p.startsWith('/functions/v1/')) {
    const name = p.split('/')[3];
    const h = handlers[name];
    if (!h) return json({ error: 'not found' }, 404);
    return h(req);
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (p.startsWith('/rest/v1/')) {
    const headers = new Headers(req.headers);
    if (!headers.get('authorization') && headers.get('apikey')) headers.set('authorization', `Bearer ${headers.get('apikey')}`);
    headers.delete('host');
    const res = await fetch(`${PGRST}${p.slice('/rest/v1'.length)}${url.search}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
    });
    const out = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    return new Response(res.body, { status: res.status, headers: out });
  }

  if (p === '/auth/v1/token') {
    const body = await req.json().catch(() => ({}));
    const grant = url.searchParams.get('grant_type');
    let user = null;
    if (grant === 'password') user = USERS.find((u) => u.email === body.email && u.password === body.password);
    if (grant === 'refresh_token') user = USERS.find((u) => `r-${u.id}` === body.refresh_token);
    if (!user) return json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
    return json(await issue(user));
  }
  if (p === '/auth/v1/user') {
    const claims = await verifyJwt((req.headers.get('authorization') ?? '').replace(/^Bearer /, ''));
    if (!claims?.sub || claims.role !== 'authenticated') return json({ msg: 'invalid' }, 401);
    return json({ id: claims.sub, email: claims.email });
  }
  if (p === '/auth/v1/logout') return new Response(null, { status: 204, headers: cors });

  if (p.startsWith('/storage/v1/object/public/')) {
    const key = p.slice('/storage/v1/object/public/'.length);
    const f = storage.get(key);
    return f ? new Response(f.body, { headers: { 'Content-Type': f.type, ...cors } }) : json({ error: 'not found' }, 404);
  }
  if (p.startsWith('/storage/v1/object/') && req.method === 'POST') {
    const claims = await verifyJwt((req.headers.get('authorization') ?? '').replace(/^Bearer /, ''));
    if (!claims?.sub) return json({ error: 'unauthorized' }, 403);
    // Igual que en Supabase: la política RLS exige ser administrador.
    const isAdm = await fetch(`${PGRST}/rpc/is_admin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${(req.headers.get('authorization') ?? '').replace(/^Bearer /, '')}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).then((r) => r.json());
    if (isAdm !== true) return json({ error: 'new row violates row-level security policy' }, 403);
    const key = p.slice('/storage/v1/object/'.length);
    storage.set(key, { body: new Uint8Array(await req.arrayBuffer()), type: req.headers.get('content-type') ?? 'application/octet-stream' });
    return json({ Key: key });
  }

  // --- Imitación de Stripe ---
  if (p === '/fake-stripe/v1/checkout/sessions' && req.method === 'POST') {
    const form = new URLSearchParams(await req.text());
    const id = `cs_test_${crypto.randomUUID().replace(/-/g, '')}`;
    const s = {
      id,
      url: `http://127.0.0.1:54321/fake-stripe/pay/${id}`,
      status: 'open',
      amount_total: Number(form.get('line_items[0][price_data][unit_amount]')),
      currency: form.get('line_items[0][price_data][currency]'),
      success_url: form.get('success_url'),
      metadata: { order_id: form.get('metadata[order_id]') },
    };
    fakeStripeSessions.set(id, s);
    return json(s);
  }
  if (p.startsWith('/fake-stripe/v1/checkout/sessions/')) {
    const s = fakeStripeSessions.get(p.split('/').pop());
    return s ? json(s) : json({ error: { message: 'No such session' } }, 404);
  }
  if (p.startsWith('/fake-stripe/pay/')) {
    const s = fakeStripeSessions.get(p.split('/').pop());
    if (!s) return new Response('no', { status: 404 });
    // Página de pago falsa: el usuario "vuelve" a la web SIN que haya llegado el webhook.
    return new Response(`<!doctype html><title>Stripe (prueba)</title><h1>Pago de prueba ${s.amount_total / 100} €</h1>
      <a id="volver" href="${s.success_url.replace('{CHECKOUT_SESSION_ID}', s.id)}">Volver a la web</a>`, { headers: { 'Content-Type': 'text/html' } });
  }
  if (p === '/fake-stripe/sessions') return json([...fakeStripeSessions.values()]);
  if (p === '/fake-resend/emails') {
    const body = await req.json();
    sentEmails.push(body);
    return json({ id: `email_${sentEmails.length}` });
  }
  if (p === '/fake-resend/sent') return json(sentEmails.map((e) => ({ to: e.to, subject: e.subject, text: e.text })));
  return json({ error: 'not found' }, 404);
}

const MIME = {
  html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', json: 'application/json',
  txt: 'text/plain', xml: 'application/xml', woff2: 'font/woff2', webmanifest: 'application/manifest+json',
};
async function staticServer(req) {
  let p = decodeURIComponent(new URL(req.url).pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (p.includes('..')) return new Response('bad', { status: 400 });
  const base = `${ROOT}public`;
  // En pruebas, config.js apunta al entorno local (el archivo real no se toca).
  if (p === '/config.js' && Deno.env.get('TEST_PUBLIC_ANON') && !Deno.env.get('TEST_NO_CONFIG')) {
    const cfg = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: Deno.env.get('TEST_PUBLIC_ANON'), LEAD_GATE: true };
    return new Response(`window.WQV_CONFIG = ${JSON.stringify(cfg)};`, { headers: { 'Content-Type': MIME.js } });
  }
  for (const candidate of [p, `${p}.html`]) {
    try {
      const data = await Deno.readFile(base + candidate);
      // Misma política de seguridad que public/_headers (con el Supabase local).
      const csp = (await Deno.readTextFile(`${base}/_headers`)).match(/Content-Security-Policy: (.*)/)[1].replace(/https:\/\/\*\.supabase\.co/g, 'http://127.0.0.1:54321');
      return new Response(data, { headers: { 'Content-Type': MIME[candidate.split('.').pop()] ?? 'application/octet-stream', 'Content-Security-Policy': csp } });
    } catch { /* siguiente */ }
  }
  return new Response(await Deno.readFile(`${base}/404.html`), { status: 404, headers: { 'Content-Type': MIME.html } });
}

Deno.serve({ port: 54321, hostname: '127.0.0.1', onListen: () => console.log('gateway :54321') }, gateway);
Deno.serve({ port: 8080, hostname: '127.0.0.1', onListen: () => console.log('web :8080') }, staticServer);
