export type ServiceCard = { key: string; title: string; description: string };
export type ProcessStep = { title: string; description: string };

export type SiteSettings = {
  business_name: string;
  logo_url: string | null;
  accent_color: string;
  contact_email: string | null;
  whatsapp: string | null;
  hero_title: string;
  hero_subtitle: string;
  services: ServiceCard[];
  process_steps: ProcessStep[];
  pricing_note: string | null;
  footer_text: string | null;
  legal_owner_name: string | null;
  legal_tax_id: string | null;
  legal_address: string | null;
  legal_email: string | null;
  legal_registry: string | null;
  terms_version: string;
  payment_mode: 'full' | 'deposit';
  deposit_percent: number;
};

export type Package = {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  audience: string | null;
  description: string | null;
  features: string[];
  page_limit: number | null;
  revision_rounds: number;
  badge: string | null;
  highlighted: boolean;
  cta_label: string | null;
  active: boolean;
  sort: number;
};

export type Addon = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  unit: 'one_time' | 'monthly' | 'hourly';
  price_from: boolean;
  active: boolean;
  sort: number;
};

export type MaintenancePlan = {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  price_from: boolean;
  description: string | null;
  features: string[];
  response_time: string | null;
  limits: string | null;
  active: boolean;
  sort: number;
};

export type Faq = { id: string; question: string; answer: string; active: boolean; sort: number };

export type DemoProject = {
  id: string;
  title: string;
  sector: string;
  description: string | null;
  layout: string;
  palette: { bg: string; fg: string; accent: string };
  image_url: string | null;
  active: boolean;
  sort: number;
};
