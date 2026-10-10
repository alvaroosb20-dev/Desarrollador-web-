// Pruebas de extremo a extremo del backend contra el entorno local (tests/run-stack.sh).
// deno run -A tests/api.test.js
const API = 'http://127.0.0.1:54321';
const ORIGIN = 'http://127.0.0.1:8080';
const keys = Object.fromEntries(
  (await Deno.readTextFile('/tmp/wqv-keys.env')).trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const ANON = keys.ANON_KEY;

let passed = 0;
let failed = 0;
function ok(cond, msg, extra) {
  if (cond) {
    passed++;
    console.log(`  ✔ ${msg}`);
  } else {
    failed++;
    console.log(`  ✘ ${msg}`, extra ?? '');
  }
}
const section = (s) => console.log(`\n${s}`);

async function fn(name, body, { method = 'POST', query = '', headers = {}, origin = ORIGIN } = {}) {
  const res = await fetch(`${API}/functions/v1/${name}${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: ANON, ...(origin ? { Origin: origin } : {}), ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}
async function rest(path, { token = ANON, method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
async function login(email, password) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await res.json()).access_token;
}
const key = () => crypto.randomUUID();
// Los límites antispam son reales (6 reservas/hora por IP): entre bloques de pruebas se reinician.
const resetRate = () => rest('rate_limits?key=neq.x', { token: keys.SERVICE_KEY, method: 'DELETE' });
const started = () => Date.now() - 10000;
const answers = (over = {}) => ({
  name: 'Lucía Pérez',
  businessName: 'Panadería Lucía',
  businessType: 'tienda_fisica',
  websiteType: 'web_basica',
  goal: 'clientes',
  budget: '250_450',
  contentStatus: 'algo',
  timeline: '1_mes',
  email: 'lucia@ejemplo.com',
  phone: '+34 611 222 333',
  privacy: true,
  marketing: false,
  ...over,
});

// ---------------------------------------------------------------------
section('Formulario inicial');
let r = await fn('forms', { type: 'lead', answers: answers({ privacy: false }), submissionKey: key(), startedAt: started() });
ok(r.status === 400 && r.data.field === 'privacy', 'rechaza sin aceptar la privacidad');
r = await fn('forms', { type: 'lead', answers: answers({ email: 'no-es-correo' }), submissionKey: key(), startedAt: started() });
ok(r.status === 400 && r.data.field === 'email', 'rechaza correo no válido');
r = await fn('forms', { type: 'lead', answers: answers({ budget: 'millones' }), submissionKey: key(), startedAt: started() });
ok(r.status === 400 && r.data.field === 'budget', 'rechaza opciones que no existen');
r = await fn('forms', { type: 'lead', answers: answers(), submissionKey: key(), startedAt: Date.now() });
ok(r.status === 400, 'rechaza envíos instantáneos (antispam)');
r = await fn('forms', { type: 'lead', answers: answers(), submissionKey: key(), startedAt: started(), website: 'http://spam' });
ok(r.status === 400, 'rechaza si se rellena el campo trampa');
r = await fn('forms', { type: 'lead', answers: answers(), submissionKey: key(), startedAt: started() }, { origin: 'https://malicioso.example' });
ok(r.status === 403, 'rechaza peticiones desde otros dominios');

const leadKey = key();
r = await fn('forms', { type: 'lead', answers: answers(), submissionKey: leadKey, startedAt: started() });
ok(r.status === 200 && r.data.ok && typeof r.data.leadToken === 'string', 'guarda la solicitud y devuelve el comprobante');
ok(r.headers.get('access-control-allow-origin') === ORIGIN, 'CORS solo para la web propia');
const leadToken = r.data.leadToken;
const requestId = leadToken.split('.')[0];
r = await fn('forms', { type: 'lead', answers: answers(), submissionKey: leadKey, startedAt: started() });
ok(r.status === 200 && r.data.duplicate === true, 'un doble envío no crea otra solicitud');

const svc = keys.SERVICE_KEY;
r = await rest(`requests?select=id,status,business_name,contact_id&id=eq.${requestId}`, { token: svc });
ok(r.data.length === 1 && r.data[0].business_name === 'Panadería Lucía', 'la solicitud está en la base de datos');
r = await rest(`request_answers?select=step&request_id=eq.${requestId}`, { token: svc });
ok(r.data.length === 11, 'se guardan las 11 respuestas');

r = await fn('forms', { type: 'lead', answers: answers({ businessName: '__sin_nombre__', email: 'otro@ejemplo.com' }), submissionKey: key(), startedAt: started() });
ok(r.status === 200, 'acepta «Todavía no tengo nombre»');

section('Formulario de contacto');
r = await fn('forms', { type: 'contact', name: 'Pepe', email: 'pepe@ejemplo.com', message: 'corto', privacy: true, submissionKey: key(), startedAt: started() });
ok(r.status === 400 && r.data.field === 'message', 'exige un mensaje mínimo');
r = await fn('forms', { type: 'contact', name: 'Pepe', email: 'pepe@ejemplo.com', topic: 'Tiendas online', message: 'Quiero información sobre tiendas online.', privacy: true, submissionKey: key(), startedAt: started() });
ok(r.status === 200 && r.data.ok, 'guarda el mensaje de contacto');

// ---------------------------------------------------------------------
section('Privacidad (RLS)');
r = await rest('requests?select=*');
ok(r.status === 401 || (Array.isArray(r.data) && r.data.length === 0) || r.status === 403, 'un visitante NO puede leer solicitudes', r);
r = await rest('contacts?select=*');
ok(r.status >= 400 || r.data.length === 0, 'un visitante NO puede leer contactos');
r = await rest('requests', { method: 'POST', body: { contact_id: requestId, privacy_accepted_at: new Date().toISOString() } });
ok(r.status >= 400, 'un visitante NO puede escribir directamente en la base de datos');
r = await rest('rpc/submit_lead', { method: 'POST', body: { p: {} } });
ok(r.status >= 400, 'un visitante NO puede llamar a las funciones internas');
r = await rest('private_settings?select=*');
ok(r.status >= 400 || r.data.length === 0, 'la clave privada del calendario no es pública');
r = await rest('packages?select=slug,price_cents');
ok(r.status === 200 && r.data.length === 3, 'los paquetes sí son públicos');

const intruder = await login('intruso@prueba.local', 'clave-intruso-123');
r = await rest('requests?select=*', { token: intruder });
ok(r.status === 200 && r.data.length === 0, 'un usuario registrado sin permisos no ve nada');
r = await rest('packages?slug=eq.web-basica', { token: intruder, method: 'PATCH', body: { price_cents: 1 } });
r = await rest('packages?select=price_cents&slug=eq.web-basica');
ok(r.data[0].price_cents === 24999, 'un usuario sin permisos no puede cambiar precios');
r = await rest('rpc/admin_dashboard', { token: intruder, method: 'POST', body: {} });
ok(r.status >= 400, 'un usuario sin permisos no puede ver el resumen');
r = await fn('admin', { action: 'status' }, { headers: { Authorization: `Bearer ${intruder}` } });
ok(r.status === 401, 'la función de administración rechaza a usuarios sin permisos');
r = await fn('admin', { action: 'status' });
ok(r.status === 401, 'la función de administración rechaza peticiones sin sesión');

const admin = await login('admin@prueba.local', 'clave-admin-123');
r = await rest('requests_overview?select=id,contact_name&order=created_at.desc', { token: admin });
ok(r.status === 200 && r.data.length >= 3, 'el administrador ve las solicitudes');
r = await rest('rpc/admin_dashboard', { token: admin, method: 'POST', body: {} });
ok(r.status === 200 && r.data.requests_total >= 3, 'el administrador ve el resumen');

// ---------------------------------------------------------------------
section('Reservas');
r = await fn('booking', null, { method: 'GET' });
ok(r.status === 200 && r.data.enabled && r.data.days.length > 0, 'devuelve días con huecos libres');
const keysInDay = Object.keys(r.data.days[0]);
ok(!JSON.stringify(r.data).includes('@'), 'la disponibilidad no expone datos de otras reservas', keysInDay);
const day = r.data.days.find((d) => d.slots.length > 3);
const slot = day.slots[2];
const bookingBody = (over = {}) => ({
  action: 'create',
  start: slot,
  name: 'Lucía Pérez',
  email: 'lucia@ejemplo.com',
  phone: '611222333',
  summary: 'Web para mi panadería',
  timezone: 'Europe/Madrid',
  privacy: true,
  leadToken,
  startedAt: started(),
  ...over,
});
r = await fn('booking', bookingBody({ start: '2020-01-01T10:00:00Z' }));
ok(r.status === 409, 'rechaza horarios pasados o no ofrecidos');
r = await fn('booking', bookingBody({ start: new Date(new Date(slot).getTime() + 60000).toISOString() }));
ok(r.status === 409, 'rechaza horas que no son un hueco válido');

// Dos personas reservan el mismo hueco a la vez
const [a, b] = await Promise.all([
  fn('booking', bookingBody()),
  fn('booking', bookingBody({ name: 'Marcos Gil', email: 'marcos@ejemplo.com', leadToken: undefined })),
]);
const okCount = [a, b].filter((x) => x.status === 200).length;
ok(okCount === 1 && [a, b].some((x) => x.status === 409), 'dos reservas simultáneas del mismo hueco: solo una gana', [a.status, b.status]);
const winner = a.status === 200 ? a : b;
const manageToken = winner.data.booking.manageToken;
ok(winner.data.booking.emailStatus === 'sent', 'se envía el correo de confirmación (Resend configurado)');

r = await fn('booking', null, { method: 'GET', query: `?from=${day.date}&to=${day.date}` });
ok(!r.data.days[0]?.slots.includes(slot), 'el hueco reservado deja de ofrecerse');

r = await fn('booking', bookingBody({ start: day.slots[4], email: 'lucia.otra@ejemplo.com' }));
ok(r.status === 200, 'reserva tras completar el formulario');
r = await rest(`bookings?select=request_id&email=eq.lucia.otra@ejemplo.com`, { token: svc });
ok(r.data[0]?.request_id === requestId, 'se vincula a su solicitud gracias al comprobante firmado');
r = await fn('booking', bookingBody({ start: day.slots[5], email: 'falso@ejemplo.com', leadToken: `${requestId}.firmafalsa` }));
r = await rest(`bookings?select=request_id&email=eq.falso@ejemplo.com`, { token: svc });
ok(r.data[0]?.request_id === null, 'un comprobante falsificado no vincula a la solicitud de otra persona');

await resetRate();
r = await fn('booking', bookingBody({ start: day.slots[6], name: 'Nadia Ruiz', email: 'nadia@ejemplo.com', leadToken: undefined }));
ok(r.status === 200, 'se puede reservar sin haber completado el formulario');
r = await rest(`bookings?select=request_id,contacts(email)&email=eq.nadia@ejemplo.com`, { token: svc });
ok(r.data.length === 1 && r.data[0].request_id === null && r.data[0].contacts.email === 'nadia@ejemplo.com', 'y queda registrada como contacto nuevo');

r = await fn('booking', { action: 'lookup', token: manageToken });
ok(r.status === 200 && r.data.booking.status === 'confirmed', 'el enlace seguro permite consultar la cita');
r = await fn('booking', { action: 'lookup', token: 'a'.repeat(48) });
ok(r.status === 404, 'un enlace inventado no funciona');
const newSlot = day.slots[9] ?? r.data?.days?.[1]?.slots?.[0];
r = await fn('booking', { action: 'reschedule', token: manageToken, start: newSlot });
ok(r.status === 200 && r.data.startsAt === newSlot, 'se puede cambiar la cita con el enlace');
r = await fn('booking', null, { method: 'GET', query: `?from=${day.date}&to=${day.date}` });
ok(r.data.days[0]?.slots.includes(slot), 'el hueco antiguo vuelve a estar libre');
r = await fn('booking', { action: 'cancel', token: manageToken, reason: 'No puedo' });
ok(r.status === 200, 'se puede cancelar la cita con el enlace');
r = await fn('booking', { action: 'cancel', token: manageToken });
ok(r.status === 400, 'no se puede cancelar dos veces');

// Bloqueo de horario por el administrador
const blockStart = day.slots[12];
r = await rest('availability_blocks', {
  token: admin,
  method: 'POST',
  body: { kind: 'block', starts_at: blockStart, ends_at: new Date(new Date(blockStart).getTime() + 3600000).toISOString(), reason: 'Prueba' },
  prefer: 'return=representation',
});
ok(r.status === 201, 'el administrador puede bloquear horarios');
r = await fn('booking', null, { method: 'GET', query: `?from=${day.date}&to=${day.date}` });
ok(!r.data.days[0]?.slots.includes(blockStart), 'un horario bloqueado no se ofrece');
r = await rest('availability_blocks', {
  token: intruder,
  method: 'POST',
  body: { kind: 'block', starts_at: blockStart, ends_at: new Date(new Date(blockStart).getTime() + 3600000).toISOString() },
});
ok(r.status >= 400, 'un usuario sin permisos no puede bloquear horarios');

// Cambio y cancelación desde el panel (función admin)
await resetRate();
const adminBooking = await fn('booking', bookingBody({ start: day.slots[15] ?? day.slots[day.slots.length - 1], name: 'Óscar Díaz', email: 'oscar@ejemplo.com', leadToken: undefined }));
const ab = await rest(`bookings?select=id&email=eq.oscar@ejemplo.com`, { token: admin });
ok(adminBooking.status === 200 && ab.data.length === 1, 'el administrador ve la reserva');
r = await fn('admin', { action: 'cancel', id: ab.data[0].id, reason: 'Prueba' }, { headers: { Authorization: `Bearer ${admin}` } });
ok(r.status === 200, 'el administrador puede cancelar una llamada');

// ---------------------------------------------------------------------
section('Contratación y pagos');
const orderBody = (over = {}) => ({
  package: 'web-avanzada',
  maintenance: 'mantenimiento-basico',
  requirements: 'Necesito una sección de blog',
  name: 'Lucía Pérez',
  email: 'lucia@ejemplo.com',
  phone: '611222333',
  acceptTerms: true,
  acceptPrivacy: true,
  mode: 'pay',
  submissionKey: key(),
  leadToken,
  startedAt: started(),
  ...over,
});
r = await fn('checkout', orderBody({ acceptTerms: false }));
ok(r.status === 400 && r.data.field === 'acceptTerms', 'exige aceptar las condiciones');
r = await fn('checkout', orderBody({ package: 'no-existe' }));
ok(r.status === 400, 'rechaza planes que no existen');
r = await fn('checkout', orderBody({ mode: 'quote' }));
ok(r.status === 200 && r.data.redirect.includes('pedido.html?pedido='), 'presupuesto revisado: registra el pedido sin cobrar');

const payKey = key();
r = await fn('checkout', orderBody({ submissionKey: payKey }));
ok(r.status === 200 && r.data.redirect.includes('/fake-stripe/pay/'), 'pago: crea la sesión de Stripe en el servidor');
const sessions = await (await fetch(`${API}/fake-stripe/sessions`)).json();
const session = sessions.at(-1);
ok(session.amount_total === 44999, 'el importe sale de la base de datos (449,99 €)');
const orderId = session.metadata.order_id;
r = await fn('checkout', orderBody({ submissionKey: payKey }));
ok(r.status === 200 && r.data.redirect === session.url, 'un doble clic reutiliza la misma sesión de pago');

// Volver a la página de éxito NO marca nada como pagado
r = await fn('checkout', null, { method: 'GET', query: `?pedido=${orderId}` });
ok(r.data.order.status === 'pending_payment' && r.data.order.paidCents === 0, 'volver de Stripe sin webhook NO marca el pedido como pagado');
ok(!JSON.stringify(r.data).includes('lucia@'), 'el estado del pedido no expone datos personales');

// Nadie puede marcar pagado desde el navegador
r = await rest(`orders?id=eq.${orderId}`, { token: admin, method: 'PATCH', body: { status: 'paid' } });
ok(r.status >= 400, 'ni siquiera el administrador puede marcar «pagado» a mano', r.status);
r = await rest('payments', { token: admin, method: 'POST', body: { order_id: orderId, amount_cents: 44999, status: 'paid' } });
ok(r.status >= 400, 'no se pueden crear pagos desde el navegador');
r = await rest(`orders?id=eq.${orderId}`, { method: 'PATCH', body: { status: 'paid' } });
r = await rest(`orders?select=status&id=eq.${orderId}`, { token: svc });
ok(r.data[0].status === 'pending_payment', 'un visitante tampoco');

// Webhook con firma falsa
async function stripeEvent(event, secret = 'whsec_local') {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${payload}`))))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  const res = await fetch(`${API}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${t},v1=${sig}`, 'Content-Type': 'application/json' },
    body: payload,
  });
  return { status: res.status, data: await res.json() };
}
const paidEvent = (id, over = {}) => ({
  id,
  type: 'checkout.session.completed',
  data: { object: { id: session.id, payment_status: 'paid', amount_total: 44999, currency: 'eur', payment_intent: 'pi_test_1', ...over } },
});
r = await stripeEvent(paidEvent('evt_fake'), 'whsec_otro');
ok(r.status === 400, 'el webhook rechaza firmas no válidas');
r = await stripeEvent(paidEvent('evt_amount', { amount_total: 100 }));
ok(r.status === 500, 'el webhook rechaza importes que no coinciden');
r = await rest(`orders?select=status&id=eq.${orderId}`, { token: svc });
ok(r.data[0].status === 'pending_payment', 'y el pedido sigue pendiente');
r = await stripeEvent(paidEvent('evt_ok'));
ok(r.status === 200, 'el webhook firmado se acepta');
r = await fn('checkout', null, { method: 'GET', query: `?pedido=${orderId}` });
ok(r.data.order.status === 'paid' && r.data.order.paidCents === 44999, 'el webhook marca el pedido como pagado');
r = await stripeEvent(paidEvent('evt_ok'));
ok(r.data.duplicate === true, 'un evento repetido no se procesa dos veces');
r = await rest(`payments?select=id&order_id=eq.${orderId}&status=eq.paid`, { token: svc });
ok(r.data.length === 1, 'solo hay un pago registrado');

// Pago manual (transferencia) desde el panel
r = await fn('checkout', orderBody({ mode: 'quote', package: 'tienda-online' }));
const quoteOrder = r.data.redirect.split('pedido=')[1];
r = await rest('rpc/admin_add_manual_payment', { token: intruder, method: 'POST', body: { p_order: quoteOrder, p_amount_cents: 1000 } });
ok(r.status >= 400, 'un usuario sin permisos no puede registrar cobros');
r = await rest('rpc/admin_add_manual_payment', { token: admin, method: 'POST', body: { p_order: quoteOrder, p_amount_cents: 20000, p_note: 'Transferencia' } });
ok(r.status === 200 && r.data === 'deposit_paid', 'el administrador registra un cobro manual parcial');
r = await rest('rpc/admin_dashboard', { token: admin, method: 'POST', body: {} });
ok(r.data.revenue_cents === 64999 && r.data.revenue_stripe_cents === 44999, 'el resumen separa lo cobrado', r.data);
ok(r.data.pending_cents > 0, 'y lo pendiente de cobrar');

// ---------------------------------------------------------------------
section('Integraciones y calendario');
r = await fn('admin', { action: 'status' }, { headers: { Authorization: `Bearer ${admin}` } });
ok(r.status === 200 && r.data.integrations.stripe && r.data.integrations.email, 'el panel ve el estado de las integraciones');
const priv = await rest('private_settings?select=calendar_feed_key', { token: admin });
const feed = await fetch(`${API}/functions/v1/calendar-feed?key=${priv.data[0].calendar_feed_key}`);
const ics = await feed.text();
ok(feed.status === 200 && ics.startsWith('BEGIN:VCALENDAR') && ics.includes('Llamada: Nadia Ruiz'), 'el calendario suscribible funciona');
ok((await fetch(`${API}/functions/v1/calendar-feed?key=mal`)).status === 401, 'y exige la clave');
const mails = await (await fetch(`${API}/fake-resend/sent`)).json();
ok(mails.some((m) => m.subject.startsWith('Tu llamada está reservada')), 'correos de reserva enviados');
ok(mails.some((m) => m.subject.startsWith('Hemos recibido tu solicitud')), 'correo de solicitud recibida enviado');
ok(mails.some((m) => m.subject === 'Pago confirmado por Stripe'), 'aviso de pago al administrador');

console.log(`\n${passed} correctas, ${failed} fallidas`);
if (failed) Deno.exit(1);
