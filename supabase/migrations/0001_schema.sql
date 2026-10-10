-- =====================================================================
-- WEBS QUE VENDEN — Esquema principal
-- Ejecutar en Supabase: SQL Editor → pegar y ejecutar (o `supabase db push`).
-- Todas las tablas tienen RLS activado. El público NO puede leer ni escribir
-- datos de clientes: las escrituras públicas pasan por el servidor (Next.js)
-- con la clave service_role, después de validar y aplicar antispam.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Administradores
-- ---------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Configuración general (una sola fila)
-- ---------------------------------------------------------------------
create table public.site_settings (
  id               int primary key default 1 check (id = 1),
  business_name    text not null default 'WEBS QUE VENDEN',
  logo_url         text,
  accent_color     text not null default '#c8f26d' check (accent_color ~* '^#[0-9a-f]{6}$'),
  contact_email    text,
  whatsapp         text,
  hero_title       text not null default 'Tu próxima web puede ser el comienzo de algo grande',
  hero_subtitle    text not null default 'Diseñamos páginas web modernas para que tu negocio destaque, consiga clientes y venda por Internet.',
  services         jsonb not null default '[]'::jsonb,
  process_steps    jsonb not null default '[]'::jsonb,
  pricing_note     text,
  footer_text      text,
  -- Datos legales (se rellenan desde el panel; nunca se inventan)
  legal_owner_name text,
  legal_tax_id     text,
  legal_address    text,
  legal_email      text,
  legal_registry   text,
  terms_version    text not null default '1.0',
  -- Pagos
  payment_mode     text not null default 'full' check (payment_mode in ('full','deposit')),
  deposit_percent  int  not null default 50 check (deposit_percent between 1 and 100),
  updated_at       timestamptz not null default now()
);
create trigger trg_site_settings_updated before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Configuración de reservas (una sola fila)
-- weekly_hours: {"1":[{"start":"10:00","end":"14:00"}], ...}  (1 = lunes … 7 = domingo)
-- ---------------------------------------------------------------------
create table public.booking_settings (
  id               int primary key default 1 check (id = 1),
  enabled          boolean not null default false,
  timezone         text not null default 'Atlantic/Canary',
  duration_min     int  not null default 15 check (duration_min between 5 and 240),
  buffer_min       int  not null default 5  check (buffer_min between 0 and 120),
  min_notice_min   int  not null default 720 check (min_notice_min between 0 and 20160),
  max_advance_days int  not null default 30 check (max_advance_days between 1 and 365),
  weekly_hours     jsonb not null default '{}'::jsonb,
  meeting_details  text not null default 'Te llamaremos al teléfono que indiques. Si prefieres videollamada, indícalo en la descripción y te enviaremos un enlace.',
  updated_at       timestamptz not null default now()
);
create trigger trg_booking_settings_updated before update on public.booking_settings
  for each row execute function public.touch_updated_at();

create table public.availability_blocks (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('holiday','vacation','block')),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index availability_blocks_range_idx on public.availability_blocks (starts_at, ends_at);

-- ---------------------------------------------------------------------
-- Catálogo: paquetes, servicios adicionales, mantenimiento
-- ---------------------------------------------------------------------
create table public.packages (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name            text not null,
  price_cents     int  not null check (price_cents >= 0),
  audience        text,
  description     text,
  features        jsonb not null default '[]'::jsonb,
  page_limit      int,
  revision_rounds int  not null default 1,
  badge           text,
  highlighted     boolean not null default false,
  cta_label       text,
  active          boolean not null default true,
  sort            int not null default 0,
  updated_at      timestamptz not null default now()
);
create trigger trg_packages_updated before update on public.packages
  for each row execute function public.touch_updated_at();

create table public.addons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price_cents int not null check (price_cents >= 0),
  unit        text not null default 'one_time' check (unit in ('one_time','monthly','hourly')),
  price_from  boolean not null default false,
  active      boolean not null default true,
  sort        int not null default 0,
  updated_at  timestamptz not null default now()
);
create trigger trg_addons_updated before update on public.addons
  for each row execute function public.touch_updated_at();

create table public.maintenance_plans (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name          text not null,
  price_cents   int  not null check (price_cents >= 0),
  price_from    boolean not null default false,
  description   text,
  features      jsonb not null default '[]'::jsonb,
  response_time text,
  limits        text,
  active        boolean not null default true,
  sort          int not null default 0,
  updated_at    timestamptz not null default now()
);
create trigger trg_maintenance_updated before update on public.maintenance_plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Contenido: preguntas frecuentes y proyectos de demostración
-- ---------------------------------------------------------------------
create table public.faqs (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  answer     text not null,
  active     boolean not null default true,
  sort       int not null default 0
);

create table public.demo_projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  sector      text not null,
  description text,
  layout      text not null default 'generic',
  palette     jsonb not null default '{"bg":"#111111","fg":"#f5f5f5","accent":"#c8f26d"}'::jsonb,
  image_url   text,
  active      boolean not null default true,
  sort        int not null default 0
);

-- ---------------------------------------------------------------------
-- CRM: contactos, solicitudes, respuestas, notas privadas
-- ---------------------------------------------------------------------
create table public.contacts (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  email                text not null,
  phone                text,
  marketing_consent    boolean not null default false,
  marketing_consent_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index contacts_email_unique on public.contacts (lower(email));
create trigger trg_contacts_updated before update on public.contacts
  for each row execute function public.touch_updated_at();

create table public.requests (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid not null references public.contacts(id) on delete cascade,
  source              text not null default 'wizard' check (source in ('wizard','contact','checkout')),
  status              text not null default 'nueva' check (status in
                        ('nueva','pendiente','contactada','presupuesto_enviado','aceptada','en_desarrollo','entregada','rechazada')),
  business_name       text,
  business_type       text,
  website_type        text,
  goal                text,
  budget              text,
  content_status      text,
  timeline            text,
  message             text,
  privacy_accepted_at timestamptz not null,
  submission_key      text unique,
  ip_hash             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index requests_contact_idx on public.requests (contact_id);
create index requests_created_idx on public.requests (created_at desc);
create index requests_status_idx on public.requests (status);
create trigger trg_requests_updated before update on public.requests
  for each row execute function public.touch_updated_at();

create table public.request_answers (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.requests(id) on delete cascade,
  step           int  not null,
  question_key   text not null,
  question_label text not null,
  answer_value   text,
  answer_label   text
);
create index request_answers_request_idx on public.request_answers (request_id, step);

create table public.private_notes (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid references public.requests(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null,
  body       text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  check (request_id is not null or contact_id is not null)
);
create index private_notes_request_idx on public.private_notes (request_id);

-- ---------------------------------------------------------------------
-- Reservas de llamadas
-- blocked_until = fin de la llamada + descanso. La restricción EXCLUDE impide
-- a nivel de base de datos que dos reservas activas se solapen, incluso si dos
-- personas reservan el mismo hueco en el mismo instante.
-- ---------------------------------------------------------------------
create table public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  contact_id         uuid not null references public.contacts(id) on delete cascade,
  request_id         uuid references public.requests(id) on delete set null,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  blocked_until      timestamptz not null,
  business_timezone  text not null,
  visitor_timezone   text,
  name               text not null,
  email              text not null,
  phone              text,
  project_summary    text,
  status             text not null default 'confirmed' check (status in ('confirmed','completed','cancelled')),
  cancel_reason      text,
  cancelled_at       timestamptz,
  manage_token_hash  text not null unique,
  email_status       text not null default 'pending' check (email_status in ('pending','sent','failed','not_configured')),
  admin_email_status text not null default 'pending' check (admin_email_status in ('pending','sent','failed','not_configured')),
  reschedule_count   int  not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ends_at > starts_at),
  check (blocked_until >= ends_at),
  constraint bookings_no_overlap exclude using gist (
    tstzrange(starts_at, blocked_until, '[)') with &&
  ) where (status <> 'cancelled')
);
create index bookings_starts_idx on public.bookings (starts_at);
create index bookings_contact_idx on public.bookings (contact_id);
create index bookings_request_idx on public.bookings (request_id);
create trigger trg_bookings_updated before update on public.bookings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Contrataciones (pedidos) y pagos
-- ---------------------------------------------------------------------
create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  contact_id             uuid not null references public.contacts(id) on delete restrict,
  request_id             uuid references public.requests(id) on delete set null,
  package_id             uuid references public.packages(id) on delete set null,
  package_snapshot       jsonb not null,
  maintenance_plan_id    uuid references public.maintenance_plans(id) on delete set null,
  maintenance_snapshot   jsonb,
  requirements           text,
  total_cents            int not null check (total_cents >= 0),
  amount_due_now_cents   int not null check (amount_due_now_cents >= 0),
  payment_mode           text not null check (payment_mode in ('full','deposit')),
  status                 text not null check (status in
                           ('awaiting_quote','pending_payment','payment_setup_pending','deposit_paid','paid',
                            'payment_failed','cancelled','in_progress','delivered')),
  terms_version          text not null,
  terms_accepted_at      timestamptz not null,
  submission_key         text unique,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index orders_contact_idx on public.orders (contact_id);
create index orders_created_idx on public.orders (created_at desc);
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  provider              text not null default 'stripe',
  kind                  text not null default 'full' check (kind in ('full','deposit','balance')),
  stripe_session_id     text unique,
  stripe_payment_intent text,
  amount_cents          int not null check (amount_cents >= 0),
  currency              text not null default 'eur',
  status                text not null default 'pending' check (status in ('pending','paid','failed','expired','refunded')),
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create trigger trg_payments_updated before update on public.payments
  for each row execute function public.touch_updated_at();

-- Idempotencia de webhooks de Stripe
create table public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Antispam: límite de peticiones por clave (IP cifrada + acción)
-- ---------------------------------------------------------------------
create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (key, window_start)
);

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into n;
  -- limpieza oportunista de ventanas antiguas
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return n <= p_max;
end $$;

revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.admins              enable row level security;
alter table public.site_settings       enable row level security;
alter table public.booking_settings    enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.packages            enable row level security;
alter table public.addons              enable row level security;
alter table public.maintenance_plans   enable row level security;
alter table public.faqs                enable row level security;
alter table public.demo_projects       enable row level security;
alter table public.contacts            enable row level security;
alter table public.requests            enable row level security;
alter table public.request_answers     enable row level security;
alter table public.private_notes       enable row level security;
alter table public.bookings            enable row level security;
alter table public.orders              enable row level security;
alter table public.payments            enable row level security;
alter table public.stripe_events       enable row level security;
alter table public.rate_limits         enable row level security;

-- Contenido público de solo lectura
create policy "public read settings"     on public.site_settings     for select using (true);
create policy "public read booking cfg"  on public.booking_settings  for select using (true);
create policy "public read packages"     on public.packages          for select using (active or public.is_admin());
create policy "public read addons"       on public.addons            for select using (active or public.is_admin());
create policy "public read maintenance"  on public.maintenance_plans for select using (active or public.is_admin());
create policy "public read faqs"         on public.faqs              for select using (active or public.is_admin());
create policy "public read demos"        on public.demo_projects     for select using (active or public.is_admin());

-- El administrador puede gestionarlo todo
create policy "admin all admins"       on public.admins              for select using (public.is_admin());
create policy "admin write settings"   on public.site_settings       for update using (public.is_admin()) with check (public.is_admin());
create policy "admin write booking"    on public.booking_settings    for update using (public.is_admin()) with check (public.is_admin());
create policy "admin all blocks"       on public.availability_blocks for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all packages"     on public.packages            for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all addons"       on public.addons              for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all maintenance"  on public.maintenance_plans   for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all faqs"         on public.faqs                for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all demos"        on public.demo_projects       for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all contacts"     on public.contacts            for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all requests"     on public.requests            for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all answers"      on public.request_answers     for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all notes"        on public.private_notes       for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all bookings"     on public.bookings            for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all orders"       on public.orders              for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all payments"     on public.payments            for all using (public.is_admin()) with check (public.is_admin());
-- stripe_events y rate_limits: sin políticas → solo service_role.

-- Ningún permiso de escritura directo para anon sobre datos de clientes.
revoke insert, update, delete on public.contacts, public.requests, public.request_answers,
  public.private_notes, public.bookings, public.orders, public.payments,
  public.stripe_events, public.rate_limits from anon;

-- ---------------------------------------------------------------------
-- Vista para el panel: solicitud + datos de contacto + vínculos.
-- security_invoker = true → aplica las RLS de las tablas a quien consulta
-- (un visitante anónimo no ve ninguna fila).
-- ---------------------------------------------------------------------
create view public.requests_overview with (security_invoker = true) as
select
  r.*,
  c.name              as contact_name,
  c.email             as contact_email,
  c.phone             as contact_phone,
  c.marketing_consent as marketing_consent,
  (select count(*) from public.bookings b where b.request_id = r.id) as bookings_count,
  (select count(*) from public.orders   o where o.request_id = r.id) as orders_count
from public.requests r
join public.contacts c on c.id = r.contact_id;

revoke all on public.requests_overview from anon;
