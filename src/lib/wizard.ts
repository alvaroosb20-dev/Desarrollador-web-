// Definición única de las preguntas del formulario inicial.
// La usan el asistente (cliente) y la API (servidor) para validar.

export type Option = { value: string; label: string };

export const BUSINESS_TYPES: Option[] = [
  { value: 'autonomo', label: 'Autónomo' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'tienda_fisica', label: 'Tienda física' },
  { value: 'emprendedor', label: 'Emprendedor con una idea' },
  { value: 'particular', label: 'Particular' },
  { value: 'otro', label: 'Otro' },
];

export const WEBSITE_TYPES: Option[] = [
  { value: 'web_basica', label: 'Web Básica' },
  { value: 'web_avanzada', label: 'Web Avanzada' },
  { value: 'tienda_online', label: 'Tienda Online' },
  { value: 'reservas', label: 'Página de reservas o citas' },
  { value: 'landing', label: 'Landing page para promocionar un servicio' },
  { value: 'renovar', label: 'Renovar una web existente' },
  { value: 'no_claro', label: 'Todavía no lo tengo claro' },
];

export const GOALS: Option[] = [
  { value: 'clientes', label: 'Conseguir más clientes' },
  { value: 'vender', label: 'Vender productos' },
  { value: 'servicios', label: 'Mostrar mis servicios' },
  { value: 'reservas', label: 'Recibir reservas o citas' },
  { value: 'imagen', label: 'Mejorar la imagen de mi negocio' },
  { value: 'otro', label: 'Otro objetivo' },
];

export const BUDGETS: Option[] = [
  { value: 'lt250', label: 'Menos de 250 €' },
  { value: '250_450', label: 'Entre 250 € y 450 €' },
  { value: '450_700', label: 'Entre 450 € y 700 €' },
  { value: 'gt700', label: 'Más de 700 €' },
  { value: 'asesoramiento', label: 'Prefiero recibir asesoramiento' },
];

export const CONTENT_STATUS: Option[] = [
  { value: 'todo', label: 'Sí, tengo textos e imágenes' },
  { value: 'algo', label: 'Tengo algunas cosas preparadas' },
  { value: 'nada', label: 'Necesito ayuda con todo' },
  { value: 'renovar', label: 'Ya tengo una página web que quiero renovar' },
];

export const TIMELINES: Option[] = [
  { value: 'asap', label: 'Lo antes posible' },
  { value: '1_2_semanas', label: 'En una o dos semanas' },
  { value: '1_mes', label: 'En un mes' },
  { value: 'sin_fecha', label: 'No tengo una fecha concreta' },
];

export const REQUEST_STATUSES: Option[] = [
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

export type WizardAnswers = {
  name: string;
  businessName: string; // NO_NAME si "Todavía no tengo nombre"
  businessType: string;
  websiteType: string;
  goal: string;
  budget: string;
  contentStatus: string;
  timeline: string;
  email: string;
  phone: string;
  privacy: boolean;
  marketing: boolean;
};

export const emptyAnswers: WizardAnswers = {
  name: '',
  businessName: '',
  businessType: '',
  websiteType: '',
  goal: '',
  budget: '',
  contentStatus: '',
  timeline: '',
  email: '',
  phone: '',
  privacy: false,
  marketing: false,
};

export const QUESTIONS = {
  name: '¿Cómo te llamas?',
  businessName: '¿Cómo se llama tu empresa o proyecto?',
  businessType: '¿Qué tipo de negocio tienes?',
  websiteType: '¿Qué tipo de página web necesitas?',
  goal: '¿Qué quieres conseguir con tu página web?',
  budget: '¿Qué presupuesto tienes pensado invertir?',
  contentStatus: '¿Ya tienes el contenido de tu web?',
  timeline: '¿Cuándo te gustaría tener tu web lista?',
  contact: '¿Cómo podemos contactar contigo?',
} as const;

export function labelOf(options: Option[], value: string | null | undefined): string {
  if (!value) return '—';
  return options.find((o) => o.value === value)?.label ?? value;
}

export const has = (options: Option[], v: string) => options.some((o) => o.value === v);
