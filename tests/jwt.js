// Genera los JWT anon y service_role del entorno local de pruebas.
const enc = new TextEncoder();
const secret = Deno.env.get('JWT_SECRET');
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
async function sign(p) {
  const h = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const b = b64url(enc.encode(JSON.stringify(p)));
  return `${h}.${b}.${b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${h}.${b}`)))}`;
}
const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
console.log(`ANON_KEY=${await sign({ role: 'anon', exp })}`);
console.log(`SERVICE_KEY=${await sign({ role: 'service_role', exp })}`);
