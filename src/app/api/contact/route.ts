import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { upsertContact } from '@/lib/contacts';
import { clientIpHash, rateLimit } from '@/lib/request-meta';
import { cleanText, looksLikeBot, normalizePhone, validateEmail, validateName, validatePhone } from '@/lib/validation';
import { notifyAdmin } from '@/lib/email';
import { siteUrl } from '@/lib/env';

export const runtime = 'nodejs';

const bad = (error: string, field?: string, status = 400) => NextResponse.json({ ok: false, error, field }, { status });

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Solicitud no válida.');
  }
  if (looksLikeBot(body as any)) return bad('No hemos podido verificar el envío. Inténtalo de nuevo.');

  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = normalizePhone(cleanText(body.phone, 30));
  const message = cleanText(body.message, 3000);
  const topic = cleanText(body.topic, 80);
  const privacy = body.privacy === true;
  const submissionKey = cleanText(body.submissionKey, 64);

  const e1 = validateName(name);
  if (e1) return bad(e1, 'name');
  const e2 = validateEmail(email);
  if (e2) return bad(e2, 'email');
  const e3 = validatePhone(phone);
  if (e3) return bad(e3, 'phone');
  if (message.length < 10) return bad('Cuéntanos un poco más (mínimo 10 caracteres).', 'message');
  if (!privacy) return bad('Debes aceptar la política de privacidad.', 'privacy');
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(submissionKey)) return bad('Solicitud no válida. Recarga la página.');

  const db = serviceClient();
  const { data: dup } = await db.from('requests').select('id').eq('submission_key', submissionKey).maybeSingle();
  if (dup) return NextResponse.json({ ok: true, duplicate: true });

  const ipHash = await clientIpHash();
  if (!(await rateLimit('contact', ipHash, 5, 3600))) {
    return bad('Has enviado varios mensajes seguidos. Espera un poco antes de volver a intentarlo.', undefined, 429);
  }

  try {
    const contact = await upsertContact(db, { name, email, phone: phone || null });
    const { data, error } = await db
      .from('requests')
      .insert({
        contact_id: contact.id,
        source: 'contact',
        status: 'nueva',
        message: topic ? `[${topic}] ${message}` : message,
        privacy_accepted_at: new Date().toISOString(),
        submission_key: submissionKey,
        ip_hash: ipHash,
      })
      .select('id')
      .single();
    if (error) throw error;

    await notifyAdmin(
      'Nuevo mensaje desde el formulario de contacto',
      [
        ['Nombre', name],
        ['Correo', email],
        ['Teléfono', phone || '—'],
        ['Asunto', topic || '—'],
        ['Mensaje', message],
      ],
      `${siteUrl()}/admin/solicitudes/${data.id}`,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('contact error', e);
    return bad('No hemos podido enviar tu mensaje. Inténtalo de nuevo en unos segundos.', undefined, 500);
  }
}
