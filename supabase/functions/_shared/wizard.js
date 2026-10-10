// Definición única de las preguntas del formulario inicial.
// La usan el asistente (navegador) y el servidor (validación).
// ESTE ARCHIVO ESTÁ DUPLICADO en public/assets/js/wizard-data.js. Un test
// comprueba que ambos son idénticos: si cambias uno, copia el otro.

export const BUSINESS_TYPES = [
  { value: 'autonomo', label: 'Autónomo' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'tienda_fisica', label: 'Tienda física' },
  { value: 'emprendedor', label: 'Emprendedor' },
  { value: 'particular', label: 'Particular' },
  { value: 'otro', label: 'Otro' },
];

export const WEBSITE_TYPES = [
  { value: 'web_basica', label: 'Web Básica' },
  { value: 'web_avanzada', label: 'Web Avanzada' },
  { value: 'tienda_online', label: 'Tienda Online' },
  { value: 'reservas', label: 'Página de reservas o citas' },
  { value: 'landing', label: 'Landing page' },
  { value: 'renovar', label: 'Renovación de una web existente' },
  { value: 'no_claro', label: 'No estoy seguro, necesito asesoramiento' },
];

export const GOALS = [
  { value: 'clientes', label: 'Conseguir más clientes' },
  { value: 'vender', label: 'Vender productos' },
  { value: 'servicios', label: 'Mostrar mis servicios' },
  { value: 'reservas', label: 'Recibir reservas' },
  { value: 'imagen', label: 'Mejorar la imagen de mi negocio' },
  { value: 'otro', label: 'Otro objetivo' },
];

export const BUDGETS = [
  { value: 'lt250', label: 'Menos de 250 €' },
  { value: '250_450', label: 'Entre 250 € y 450 €' },
  { value: '450_700', label: 'Entre 450 € y 700 €' },
  { value: 'gt700', label: 'Más de 700 €' },
  { value: 'asesoramiento', label: 'Prefiero recibir asesoramiento' },
];

export const CONTENT_STATUS = [
  { value: 'todo', label: 'Tengo textos e imágenes' },
  { value: 'algo', label: 'Tengo algunas cosas preparadas' },
  { value: 'nada', label: 'Necesito ayuda con todo' },
  { value: 'renovar', label: 'Ya tengo una web que quiero renovar' },
];

export const TIMELINES = [
  { value: 'asap', label: 'Lo antes posible' },
  { value: '1_2_semanas', label: 'En una o dos semanas' },
  { value: '1_mes', label: 'En un mes' },
  { value: 'sin_fecha', label: 'Sin fecha concreta' },
];

export const REQUEST_STATUSES = [
  { value: 'nueva', label: 'Nueva' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'contactada', label: 'Contactada' },
  { value: 'presupuesto_enviado', label: 'Presupuesto enviado' },
  { value: 'aceptada', label: 'Aceptada' },
  { value: 'en_desarrollo', label: 'En desarrollo' },
  { value: 'entregada', label: 'Entregada' },
  { value: 'rechazada', label: 'Rechazada' },
];

export const NO_NAME = '__sin_nombre__';

export const QUESTIONS = {
  name: '¿Cómo te llamas?',
  businessName: '¿Cómo se llama tu empresa o proyecto?',
  businessType: '¿Qué tipo de negocio tienes?',
  websiteType: '¿Qué tipo de página web necesitas?',
  goal: '¿Qué quieres conseguir con tu web?',
  budget: '¿Qué presupuesto tienes pensado invertir?',
  contentStatus: '¿Ya tienes el contenido de tu web?',
  timeline: '¿Cuándo te gustaría tener tu web lista?',
  contact: '¿Cómo podemos contactar contigo?',
};

export function labelOf(options, value) {
  if (!value) return '—';
  return options.find((o) => o.value === value)?.label ?? value;
}

export const has = (options, v) => options.some((o) => o.value === v);

// ---------------------------------------------------------------------
// Validación compartida (en el navegador da mensajes inmediatos; el servidor
// SIEMPRE la repite antes de guardar nada).
// ---------------------------------------------------------------------
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,253}\.[a-z]{2,24}$/i;

export function cleanText(v, max = 500) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function validateName(v) {
  if (!v) return 'Escribe tu nombre.';
  if (v.length < 2) return 'El nombre es demasiado corto.';
  if (v.length > 80) return 'El nombre es demasiado largo.';
  return null;
}

export function validateEmail(v) {
  if (!v) return 'Escribe tu correo electrónico.';
  if (!EMAIL_RE.test(v) || v.length > 254) return 'Revisa el correo: no parece válido.';
  return null;
}

export function normalizePhone(v) {
  return String(v ?? '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

export function validatePhone(v, required = false) {
  if (!v) return required ? 'Escribe un teléfono.' : null;
  const digits = normalizePhone(v).replace('+', '');
  if (digits.length < 9 || digits.length > 15) return 'Revisa el teléfono: debe tener entre 9 y 15 dígitos.';
  return null;
}

export function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
