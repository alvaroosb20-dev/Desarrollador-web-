import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { upsertContact } from '@/lib/contacts';
import { clientIpHash, rateLimit } from '@/lib/request-meta';
import { LEAD_COOKIE, LEAD_COOKIE_MAX_AGE, signLead } from '@/lib/lead-cookie';
import { cleanText, looksLikeBot, normalizePhone, validateEmail, validateName, validatePhone } from '@/lib/validation';
import {
  BUDGETS,
  BUSINESS_TYPES,
  CONTENT_STATUS,
  GOALS,
  NO_NAME,
  QUESTIONS,
  TIMELINES,
  WEBSITE_TYPES,
  has,
  labelOf,
} from '@/lib/wizard';
import { notifyAdmin, sendRequestReceivedEmail } from '@/lib/email';
import { getSettings } from '@/lib/settings';
import { siteUrl } from '@/lib/env';

export const runtime = 'nodejs';

function bad(message: string, field?: string, status = 400) {
  return NextResponse.json({ ok: false, error: message, field }, { status });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Solicitud no válida.');
  }

  if (looksLikeBot(body as any, 4000)) return bad('No hemos podido verificar el envío. Inténtalo de nuevo.');

  const a = (body.answers ?? {}) as Record<string, unknown>;
  const name = cleanText(a.name, 80);
  const businessNameRaw = cleanText(a.businessName, 120);
  const businessType = cleanText(a.businessType, 40);
  const websiteType = cleanText(a.websiteType, 40);
  const goal = cleanText(a.goal, 40);
  const budget = cleanText(a.budget, 40);
  const contentStatus = cleanText(a.contentStatus, 40);
  const timeline = cleanText(a.timeline, 40);
  const email = cleanText(a.email, 254).toLowerCase();
  const phone = normalizePhone(cleanText(a.phone, 30));
  const privacy = a.privacy === true;
  const marketing = a.marketing === true;
  const submissionKey = cleanText(body.submissionKey, 64);

  const nameErr = validateName(name);
  if (nameErr) return bad(nameErr, 'name');
  if (!businessNameRaw) return bad('Indica el nombre de tu negocio o marca «Todavía no tengo nombre».', 'businessName');
  if (!has(BUSINESS_TYPES, businessType)) return bad('Elige un tipo de negocio.', 'businessType');
  if (!has(WEBSITE_TYPES, websiteType)) return bad('Elige qué tipo de web necesitas.', 'websiteType');
  if (!has(GOALS, goal)) return bad('Elige un objetivo.', 'goal');
  if (!has(BUDGETS, budget)) return bad('Elige un presupuesto.', 'budget');
  if (!has(CONTENT_STATUS, contentStatus)) return bad('Indica si ya tienes el contenido.', 'contentStatus');
  if (!has(TIMELINES, timeline)) return bad('Indica el plazo.', 'timeline');
  const emailErr = validateEmail(email);
  if (emailErr) return bad(emailErr, 'email');
  const phoneErr = validatePhone(phone);
  if (phoneErr) return bad(phoneErr, 'phone');
  if (!privacy) return bad('Debes aceptar la política de privacidad para enviar la solicitud.', 'privacy');
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(submissionKey)) return bad('Solicitud no válida. Recarga la página.');

  const db = serviceClient();

  // Protección frente a envíos duplicados (doble clic, reintentos de red)
  const { data: dup } = await db.from('requests').select('id').eq('submission_key', submissionKey).maybeSingle();
  if (dup) return withCookie({ ok: true, duplicate: true }, dup.id);

  const ipHash = await clientIpHash();
  if (!(await rateLimit('lead', ipHash, 5, 3600))) {
    return bad('Has enviado varias solicitudes seguidas. Espera un poco o escríbenos directamente.', undefined, 429);
  }

  const businessName = businessNameRaw === NO_NAME ? null : businessNameRaw;

  try {
    const contact = await upsertContact(db, { name, email, phone: phone || null, marketing });
    const { data: request, error } = await db
      .from('requests')
      .insert({
        contact_id: contact.id,
        source: 'wizard',
        status: 'nueva',
        business_name: businessName,
        business_type: businessType,
        website_type: websiteType,
        goal,
        budget,
        content_status: contentStatus,
        timeline,
        privacy_accepted_at: new Date().toISOString(),
        submission_key: submissionKey,
        ip_hash: ipHash,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: again } = await db.from('requests').select('id').eq('submission_key', submissionKey).single();
        if (again) return withCookie({ ok: true, duplicate: true }, again.id);
      }
      throw error;
    }

    const answers = [
      { step: 2, question_key: 'name', question_label: QUESTIONS.name, answer_value: name, answer_label: name },
      {
        step: 3,
        question_key: 'businessName',
        question_label: QUESTIONS.businessName,
        answer_value: businessName ?? NO_NAME,
        answer_label: businessName ?? 'Todavía no tengo nombre',
      },
      { step: 4, question_key: 'businessType', question_label: QUESTIONS.businessType, answer_value: businessType, answer_label: labelOf(BUSINESS_TYPES, businessType) },
      { step: 5, question_key: 'websiteType', question_label: QUESTIONS.websiteType, answer_value: websiteType, answer_label: labelOf(WEBSITE_TYPES, websiteType) },
      { step: 6, question_key: 'goal', question_label: QUESTIONS.goal, answer_value: goal, answer_label: labelOf(GOALS, goal) },
      { step: 7, question_key: 'budget', question_label: QUESTIONS.budget, answer_value: budget, answer_label: labelOf(BUDGETS, budget) },
      { step: 8, question_key: 'contentStatus', question_label: QUESTIONS.contentStatus, answer_value: contentStatus, answer_label: labelOf(CONTENT_STATUS, contentStatus) },
      { step: 9, question_key: 'timeline', question_label: QUESTIONS.timeline, answer_value: timeline, answer_label: labelOf(TIMELINES, timeline) },
      { step: 10, question_key: 'email', question_label: 'Correo electrónico', answer_value: email, answer_label: email },
      { step: 10, question_key: 'phone', question_label: 'Teléfono o WhatsApp', answer_value: phone || null, answer_label: phone || '—' },
      { step: 10, question_key: 'marketing', question_label: 'Acepta recibir comunicaciones comerciales', answer_value: String(marketing), answer_label: marketing ? 'Sí' : 'No' },
    ].map((r) => ({ ...r, request_id: request.id }));

    const { error: ansErr } = await db.from('request_answers').insert(answers);
    if (ansErr) {
      // sin respuestas la solicitud está incompleta: deshacemos para no dar un falso "enviado"
      await db.from('requests').delete().eq('id', request.id);
      throw ansErr;
    }

    // Correos (no bloquean la confirmación: la solicitud ya está guardada)
    const settings = await getSettings();
    await Promise.allSettled([
      sendRequestReceivedEmail({ to: email, name, brand: settings.business_name, replyTo: settings.contact_email }),
      notifyAdmin(
        'Nueva solicitud recibida',
        [
          ['Nombre', name],
          ['Negocio', businessName ?? 'Sin nombre todavía'],
          ['Tipo de web', labelOf(WEBSITE_TYPES, websiteType)],
          ['Presupuesto', labelOf(BUDGETS, budget)],
          ['Plazo', labelOf(TIMELINES, timeline)],
          ['Correo', email],
          ['Teléfono', phone || '—'],
        ],
        `${siteUrl()}/admin/solicitudes/${request.id}`,
      ),
    ]);

    return withCookie({ ok: true }, request.id);
  } catch (e) {
    console.error('lead error', e);
    return bad('No hemos podido guardar tu solicitud. Inténtalo de nuevo en unos segundos.', undefined, 500);
  }
}

async function withCookie(payload: Record<string, unknown>, requestId: string) {
  const res = NextResponse.json(payload);
  res.cookies.set(LEAD_COOKIE, await signLead(requestId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: LEAD_COOKIE_MAX_AGE,
  });
  return res;
}
