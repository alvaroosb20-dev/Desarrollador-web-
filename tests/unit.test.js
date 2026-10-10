// Pruebas unitarias sin base de datos: cálculo de huecos, zonas horarias y copias sincronizadas.
// deno run -A tests/unit.test.js
import { computeSlots, isSlotAvailable } from '../supabase/functions/_shared/slots.js';
import { zonedToUtc } from '../supabase/functions/_shared/time.js';
import { verifyWebhook } from '../supabase/functions/_shared/stripe.js';
import { hmacHex, signLead, verifyLead } from '../supabase/functions/_shared/crypto.js';

let failed = 0;
const ok = (c, m) => {
  console.log(`  ${c ? '✔' : '✘'} ${m}`);
  if (!c) failed++;
};
const root = new URL('..', import.meta.url).pathname;

console.log('Copias compartidas navegador/servidor');
for (const [a, b] of [
  ['supabase/functions/_shared/time.js', 'public/assets/js/time.js'],
  ['supabase/functions/_shared/wizard.js', 'public/assets/js/wizard-data.js'],
]) {
  ok((await Deno.readTextFile(root + a)) === (await Deno.readTextFile(root + b)), `${b} es idéntico a ${a}`);
}

console.log('Horarios');
const cfg = {
  enabled: true,
  timezone: 'Europe/Madrid',
  duration_min: 15,
  buffer_min: 5,
  min_notice_min: 0,
  max_advance_days: 30,
  weekly_hours: { 1: [{ start: '10:00', end: '11:00' }] },
};
const now = new Date('2026-10-04T12:00:00Z'); // domingo
const days = computeSlots(cfg, [], { y: 2026, m: 10, d: 5 }, { y: 2026, m: 10, d: 5 }, now);
ok(days[0].slots.length === 3, 'lunes 10:00-11:00 con 15 min + 5 de descanso → 3 huecos');
ok(days[0].slots[0] === '2026-10-05T08:00:00.000Z', '10:00 en Madrid (verano) = 08:00 UTC');
const busy = [{ start: new Date('2026-10-05T08:10:00Z'), end: new Date('2026-10-05T08:30:00Z') }];
const d2 = computeSlots(cfg, busy, { y: 2026, m: 10, d: 5 }, { y: 2026, m: 10, d: 5 }, now);
ok(d2[0].slots.length === 1 && d2[0].slots[0] === '2026-10-05T08:40:00.000Z', 'los huecos que se solapan con algo ocupado desaparecen');
ok(isSlotAvailable(cfg, [], '2026-10-05T08:20:00.000Z', now), 'un hueco ofrecido es válido');
ok(!isSlotAvailable(cfg, [], '2026-10-05T08:25:00.000Z', now), 'una hora intermedia no es válida');
ok(!isSlotAvailable({ ...cfg, min_notice_min: 60 * 24 * 2 }, [], '2026-10-05T08:00:00.000Z', now), 'respeta la antelación mínima');
ok(computeSlots({ ...cfg, enabled: false }, [], { y: 2026, m: 10, d: 5 }, { y: 2026, m: 10, d: 5 }, now).length === 0, 'desactivadas → sin huecos');
// Cambio de hora: 29/03/2026 a las 02:00 en Madrid no existe
ok(zonedToUtc(2026, 3, 29, 2, 30, 'Europe/Madrid') === null, 'una hora inexistente por el cambio de horario se descarta');
ok(zonedToUtc(2026, 1, 10, 10, 0, 'Atlantic/Canary').toISOString() === '2026-01-10T10:00:00.000Z', 'Canarias en invierno = UTC');

console.log('Firmas');
const tok = await signLead('s'.repeat(40), '11111111-1111-1111-1111-111111111111');
ok((await verifyLead('s'.repeat(40), tok)) === '11111111-1111-1111-1111-111111111111', 'el comprobante del formulario se verifica');
ok((await verifyLead('otro'.repeat(10), tok)) === null, 'con otra clave no vale');
const payload = '{"id":"evt_1","type":"x"}';
const t = Math.floor(Date.now() / 1000);
const sig = await hmacHex('whsec_x', `${t}.${payload}`);
ok((await verifyWebhook(payload, `t=${t},v1=${sig}`, 'whsec_x'))?.id === 'evt_1', 'firma de Stripe válida');
ok((await verifyWebhook(payload, `t=${t - 600},v1=${await hmacHex('whsec_x', `${t - 600}.${payload}`)}`, 'whsec_x')) === null, 'firma de Stripe caducada');
ok((await verifyWebhook(payload.replace('evt_1', 'evt_2'), `t=${t},v1=${sig}`, 'whsec_x')) === null, 'contenido alterado');

console.log(failed ? `\n${failed} fallidas` : '\nTodo correcto');
if (failed) Deno.exit(1);
