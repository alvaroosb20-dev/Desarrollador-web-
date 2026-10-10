// POST /functions/v1/forms
//   { type: 'lead', answers: {...}, submissionKey, startedAt, website }   → formulario inicial
//   { type: 'contact', name, email, phone, topic, message, privacy, ... } → formulario de contacto
import { env, fail, handler, ipHash, json, looksLikeBot, rateLimit, readJson, siteUrl, validKey } from '../_shared/http.js';
import { rpc } from '../_shared/db.js';
import { signLead } from '../_shared/crypto.js';
import { notifyAdmin, sendRequestReceivedEmail } from '../_shared/email.js';
import { getSettings } from '../_shared/settings.js';
import {
  BUDGETS,
  BUSINESS_TYPES,
  CONTENT_STATUS,
  GOALS,
  NO_NAME,
  QUESTIONS,
  TIMELINES,
  WEBSITE_TYPES,
  cleanText,
  has,
  labelOf,
  normalizePhone,
  validateEmail,
  validateName,
  validatePhone,
} from '../_shared/wizard.js';

async function leadToken(requestId) {
  const secret = env('LEAD_SECRET');
  if (secret.length < 32) {
    console.warn('LEAD_SECRET no configurado: no se puede vincular la solicitud con reservas posteriores.');
    return null;
  }
  return signLead(secret, requestId);
}

async function lead(req, body) {
  if (looksLikeBot(body, 4000)) return fail(req, 'No hemos podido verificar el envío. Inténtalo de nuevo.');
  const a = body.answers && typeof body.answers === 'object' ? body.answers : {};
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
  if (nameErr) return fail(req, nameErr, 400, 'name');
  if (!businessNameRaw) return fail(req, 'Indica el nombre de tu negocio o marca «Todavía no tengo nombre».', 400, 'businessName');
  if (!has(BUSINESS_TYPES, businessType)) return fail(req, 'Elige un tipo de negocio.', 400, 'businessType');
  if (!has(WEBSITE_TYPES, websiteType)) return fail(req, 'Elige qué tipo de web necesitas.', 400, 'websiteType');
  if (!has(GOALS, goal)) return fail(req, 'Elige un objetivo.', 400, 'goal');
  if (!has(BUDGETS, budget)) return fail(req, 'Elige un presupuesto.', 400, 'budget');
  if (!has(CONTENT_STATUS, contentStatus)) return fail(req, 'Indica si ya tienes el contenido.', 400, 'contentStatus');
  if (!has(TIMELINES, timeline)) return fail(req, 'Indica el plazo.', 400, 'timeline');
  const emailErr = validateEmail(email);
  if (emailErr) return fail(req, emailErr, 400, 'email');
  const phoneErr = validatePhone(phone);
  if (phoneErr) return fail(req, phoneErr, 400, 'phone');
  if (!privacy) return fail(req, 'Debes aceptar la política de privacidad para enviar la solicitud.', 400, 'privacy');
  if (!validKey(submissionKey)) return fail(req, 'Solicitud no válida. Recarga la página.');

  const ip = await ipHash(req);
  if (!(await rateLimit('lead', ip, 5, 3600))) {
    return fail(req, 'Has enviado varias solicitudes seguidas. Espera un poco o escríbenos directamente.', 429);
  }

  const businessName = businessNameRaw === NO_NAME ? null : businessNameRaw;
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
  ];

  const { data, error } = await rpc('submit_lead', {
    p: {
      source: 'wizard',
      name,
      email,
      phone,
      marketing,
      business_name: businessName,
      business_type: businessType,
      website_type: websiteType,
      goal,
      budget,
      content_status: contentStatus,
      timeline,
      submission_key: submissionKey,
      ip_hash: ip,
      answers,
    },
  });
  // Solo confirmamos al visitante si la base de datos ha guardado la solicitud.
  if (error || !data?.request_id) {
    console.error('lead error', error);
    return fail(req, 'No hemos podido guardar tu solicitud. Inténtalo de nuevo en unos segundos.', 500);
  }

  if (!data.duplicate) {
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
        `${siteUrl()}/admin.html#/solicitudes/${data.request_id}`,
      ),
    ]);
  }
  return json(req, { ok: true, duplicate: data.duplicate, leadToken: await leadToken(data.request_id) });
}

async function contact(req, body) {
  if (looksLikeBot(body)) return fail(req, 'No hemos podido verificar el envío. Inténtalo de nuevo.');
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = normalizePhone(cleanText(body.phone, 30));
  const message = cleanText(body.message, 3000);
  const topic = cleanText(body.topic, 80);
  const submissionKey = cleanText(body.submissionKey, 64);

  const e1 = validateName(name);
  if (e1) return fail(req, e1, 400, 'name');
  const e2 = validateEmail(email);
  if (e2) return fail(req, e2, 400, 'email');
  const e3 = validatePhone(phone);
  if (e3) return fail(req, e3, 400, 'phone');
  if (message.length < 10) return fail(req, 'Cuéntanos un poco más (mínimo 10 caracteres).', 400, 'message');
  if (body.privacy !== true) return fail(req, 'Debes aceptar la política de privacidad.', 400, 'privacy');
  if (!validKey(submissionKey)) return fail(req, 'Solicitud no válida. Recarga la página.');

  const ip = await ipHash(req);
  if (!(await rateLimit('contact', ip, 5, 3600))) {
    return fail(req, 'Has enviado varios mensajes seguidos. Espera un poco antes de volver a intentarlo.', 429);
  }

  const { data, error } = await rpc('submit_lead', {
    p: {
      source: 'contact',
      name,
      email,
      phone,
      marketing: false,
      message: topic ? `[${topic}] ${message}` : message,
      submission_key: submissionKey,
      ip_hash: ip,
      answers: [],
    },
  });
  if (error || !data?.request_id) {
    console.error('contact error', error);
    return fail(req, 'No hemos podido enviar tu mensaje. Inténtalo de nuevo en unos segundos.', 500);
  }
  if (!data.duplicate) {
    await notifyAdmin(
      'Nuevo mensaje desde el formulario de contacto',
      [
        ['Nombre', name],
        ['Correo', email],
        ['Teléfono', phone || '—'],
        ['Asunto', topic || '—'],
        ['Mensaje', message],
      ],
      `${siteUrl()}/admin.html#/solicitudes/${data.request_id}`,
    );
  }
  return json(req, { ok: true });
}

export default handler(async (req) => {
  const body = await readJson(req);
  if (!body) return fail(req, 'Solicitud no válida.');
  if (body.type === 'lead') return lead(req, body);
  if (body.type === 'contact') return contact(req, body);
  return fail(req, 'Tipo de formulario no válido.');
});
