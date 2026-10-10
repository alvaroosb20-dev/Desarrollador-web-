-- =====================================================================
-- WEBS QUE VENDEN — Ajustes para la web en HTML/CSS/JS puro
-- La web pública es estática: lee el contenido público con la clave anon
-- (protegida por RLS) y todas las escrituras de visitantes pasan por las
-- Edge Functions de Supabase, que usan la clave service_role en el servidor.
-- Ejecutar DESPUÉS de 0001_schema.sql y 0002_storage.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nuevos ajustes configurables desde el panel
-- ---------------------------------------------------------------------
alter table public.site_settings
  add column if not exists booking_provider text not null default 'own'
    check (booking_provider in ('own','calendly')),
  add column if not exists calendly_url text
    check (calendly_url is null or calendly_url ~ '^https://(www\.)?calendly\.com/[A-Za-z0-9_\-/]+$'),
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists analytics_snippet_url text
    check (analytics_snippet_url is null or analytics_snippet_url ~ '^https://');

-- Color de acento por defecto de la nueva identidad (latón). Editable en el panel.
alter table public.site_settings alter column accent_color set default '#d8b46a';
update public.site_settings set accent_color = '#d8b46a' where accent_color = '#c8f26d';

-- Ajustes privados (solo administradores): clave del calendario suscribible.
create table if not exists public.private_settings (
  id                int primary key default 1 check (id = 1),
  calendar_feed_key text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at        timestamptz not null default now()
);
insert into public.private_settings (id) values (1) on conflict (id) do nothing;
alter table public.private_settings enable row level security;
drop policy if exists "admin all private" on public.private_settings;
create policy "admin all private" on public.private_settings
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.private_settings from anon;

-- ---------------------------------------------------------------------
-- 2. Almacenamiento: el administrador sube el logotipo y las imágenes
--    directamente desde el panel con su sesión (no hace falta servidor).
-- ---------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml']
 where id = 'public-assets';

drop policy if exists "admin insert public-assets" on storage.objects;
drop policy if exists "admin update public-assets" on storage.objects;
drop policy if exists "admin delete public-assets" on storage.objects;
create policy "admin insert public-assets" on storage.objects
  for insert with check (bucket_id = 'public-assets' and public.is_admin());
create policy "admin update public-assets" on storage.objects
  for update using (bucket_id = 'public-assets' and public.is_admin());
create policy "admin delete public-assets" on storage.objects
  for delete using (bucket_id = 'public-assets' and public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Pagos: nadie puede fingir un cobro desde el navegador
--    · Los pagos solo los crea el servidor (webhook de Stripe) o la función
--      admin_add_manual_payment (cobros fuera de Stripe, quedan marcados).
--    · Un pedido solo pasa a "pagado"/"señal pagada" desde esas vías.
-- ---------------------------------------------------------------------
drop policy if exists "admin all payments" on public.payments;
drop policy if exists "admin read payments" on public.payments;
create policy "admin read payments" on public.payments for select using (public.is_admin());
revoke insert, update, delete on public.payments from anon, authenticated;

create or replace function public.guard_order_payment_status()
returns trigger language plpgsql as $$
begin
  if new.status in ('paid','deposit_paid')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and current_user not in ('service_role','postgres','supabase_admin')
     and coalesce(current_setting('wqv.payment_sync', true), '') <> 'on' then
    raise exception 'Los estados de pago solo los confirma Stripe o un cobro manual registrado.'
      using errcode = 'P0001', hint = 'payment_status_locked';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_guard_payment on public.orders;
create trigger trg_orders_guard_payment before insert or update on public.orders
  for each row execute function public.guard_order_payment_status();

-- Recalcula el estado del pedido según lo realmente cobrado.
create or replace function public.sync_order_paid_status(p_order uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_total int;
  v_paid  int;
  v_status text;
begin
  select total_cents into v_total from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  select coalesce(sum(amount_cents), 0) into v_paid
    from public.payments where order_id = p_order and status = 'paid';
  v_status := case when v_paid >= v_total then 'paid' when v_paid > 0 then 'deposit_paid' else null end;
  if v_status is not null then
    perform set_config('wqv.payment_sync', 'on', true);
    update public.orders set status = v_status
     where id = p_order and status not in ('in_progress','delivered');
    perform set_config('wqv.payment_sync', 'off', true);
  end if;
  return v_status;
end $$;
revoke all on function public.sync_order_paid_status(uuid) from public, anon, authenticated;
grant execute on function public.sync_order_paid_status(uuid) to service_role;

-- Cobro recibido fuera de Stripe (transferencia, Bizum…). Solo administradores.
create or replace function public.admin_add_manual_payment(p_order uuid, p_amount_cents int, p_note text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'importe_no_valido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.orders where id = p_order) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  insert into public.payments (order_id, provider, kind, amount_cents, status, paid_at)
  values (p_order, 'manual', 'balance', p_amount_cents, 'paid', now());
  if p_note is not null and length(trim(p_note)) > 0 then
    insert into public.private_notes (contact_id, author_id, body)
    select contact_id, auth.uid(), left('Cobro manual: ' || trim(p_note), 5000) from public.orders where id = p_order;
  end if;
  return public.sync_order_paid_status(p_order);
end $$;
revoke all on function public.admin_add_manual_payment(uuid, int, text) from public, anon;
grant execute on function public.admin_add_manual_payment(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Operaciones públicas atómicas (solo las llama el servidor)
-- ---------------------------------------------------------------------

-- Busca un contacto por correo o lo crea. Nunca sobrescribe datos existentes
-- con lo que escriba un visitante anónimo: solo completa los que falten.
create or replace function public.upsert_contact(p_name text, p_email text, p_phone text, p_marketing boolean)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  insert into public.contacts (name, email, phone, marketing_consent, marketing_consent_at)
  values (p_name, v_email, nullif(p_phone, ''), coalesce(p_marketing, false),
          case when p_marketing then now() end)
  on conflict ((lower(email))) do update
    set phone = coalesce(public.contacts.phone, excluded.phone),
        marketing_consent = public.contacts.marketing_consent or excluded.marketing_consent,
        marketing_consent_at = case
          when not public.contacts.marketing_consent and excluded.marketing_consent then now()
          else public.contacts.marketing_consent_at end
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.upsert_contact(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.upsert_contact(text, text, text, boolean) to service_role;

-- Solicitud del formulario inicial: contacto + solicitud + respuestas en una
-- sola transacción. Si se repite la misma submission_key, devuelve la misma.
create or replace function public.submit_lead(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_contact uuid;
  v_request uuid;
begin
  select id into v_existing from public.requests where submission_key = p->>'submission_key';
  if v_existing is not null then
    return jsonb_build_object('request_id', v_existing, 'duplicate', true);
  end if;

  v_contact := public.upsert_contact(p->>'name', p->>'email', p->>'phone', coalesce((p->>'marketing')::boolean, false));

  insert into public.requests (contact_id, source, status, business_name, business_type, website_type, goal,
                               budget, content_status, timeline, message, privacy_accepted_at, submission_key, ip_hash)
  values (v_contact, coalesce(p->>'source', 'wizard'), 'nueva', p->>'business_name', p->>'business_type',
          p->>'website_type', p->>'goal', p->>'budget', p->>'content_status', p->>'timeline', p->>'message',
          now(), p->>'submission_key', p->>'ip_hash')
  returning id into v_request;

  insert into public.request_answers (request_id, step, question_key, question_label, answer_value, answer_label)
  select v_request, (a->>'step')::int, a->>'question_key', a->>'question_label', a->>'answer_value', a->>'answer_label'
    from jsonb_array_elements(coalesce(p->'answers', '[]'::jsonb)) a;

  return jsonb_build_object('request_id', v_request, 'duplicate', false);
exception when unique_violation then
  select id into v_existing from public.requests where submission_key = p->>'submission_key';
  if v_existing is null then raise; end if;
  return jsonb_build_object('request_id', v_existing, 'duplicate', true);
end $$;
revoke all on function public.submit_lead(jsonb) from public, anon, authenticated;
grant execute on function public.submit_lead(jsonb) to service_role;

-- Reserva de llamada. La restricción EXCLUDE de la tabla impide solapes
-- aunque dos personas confirmen el mismo hueco a la vez.
create or replace function public.create_booking_record(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_contact uuid;
  v_request uuid := nullif(p->>'request_id', '')::uuid;
  v_count int;
  v_id uuid;
begin
  v_contact := public.upsert_contact(p->>'name', p->>'email', p->>'phone', false);

  if v_request is not null and not exists (select 1 from public.requests where id = v_request) then
    v_request := null;
  end if;
  -- Sin formulario previo: si ese correo ya tiene una solicitud, se vincula a la última.
  if v_request is null then
    select id into v_request from public.requests
     where contact_id = v_contact order by created_at desc limit 1;
  end if;

  select count(*) into v_count from public.bookings
   where contact_id = v_contact and status = 'confirmed' and starts_at > now();
  if v_count >= 2 then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;

  insert into public.bookings (contact_id, request_id, starts_at, ends_at, blocked_until, business_timezone,
                               visitor_timezone, name, email, phone, project_summary, status, manage_token_hash)
  values (v_contact, v_request, (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz,
          (p->>'blocked_until')::timestamptz, p->>'business_timezone', nullif(p->>'visitor_timezone', ''),
          p->>'name', lower(trim(p->>'email')), nullif(p->>'phone', ''), nullif(p->>'summary', ''),
          'confirmed', p->>'manage_token_hash')
  returning id into v_id;

  return jsonb_build_object('booking_id', v_id, 'request_id', v_request, 'contact_id', v_contact);
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end $$;
revoke all on function public.create_booking_record(jsonb) from public, anon, authenticated;
grant execute on function public.create_booking_record(jsonb) to service_role;

-- Contratación: contacto + pedido. Precios calculados en el servidor.
create or replace function public.create_order_record(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_contact uuid;
  v_request uuid := nullif(p->>'request_id', '')::uuid;
  v_id uuid;
begin
  select id into v_existing from public.orders where submission_key = p->>'submission_key';
  if v_existing is not null then
    return jsonb_build_object('order_id', v_existing, 'duplicate', true);
  end if;
  v_contact := public.upsert_contact(p->>'name', p->>'email', p->>'phone', false);
  if v_request is not null and not exists (select 1 from public.requests where id = v_request) then
    v_request := null;
  end if;
  if v_request is null then
    select id into v_request from public.requests
     where contact_id = v_contact order by created_at desc limit 1;
  end if;

  insert into public.orders (contact_id, request_id, package_id, package_snapshot, maintenance_plan_id,
                             maintenance_snapshot, requirements, total_cents, amount_due_now_cents, payment_mode,
                             status, terms_version, terms_accepted_at, submission_key)
  values (v_contact, v_request, nullif(p->>'package_id', '')::uuid, p->'package_snapshot',
          nullif(p->>'maintenance_plan_id', '')::uuid, nullif(p->'maintenance_snapshot', 'null'::jsonb),
          nullif(p->>'requirements', ''), (p->>'total_cents')::int, (p->>'amount_due_now_cents')::int,
          p->>'payment_mode', p->>'status', p->>'terms_version', now(), p->>'submission_key')
  returning id into v_id;

  -- Si la persona escribió requisitos y venía de una solicitud, la marcamos como pendiente de revisar.
  if v_request is not null then
    update public.requests set status = 'pendiente' where id = v_request and status = 'nueva';
  end if;

  return jsonb_build_object('order_id', v_id, 'duplicate', false, 'contact_id', v_contact);
exception when unique_violation then
  select id into v_existing from public.orders where submission_key = p->>'submission_key';
  if v_existing is null then raise; end if;
  return jsonb_build_object('order_id', v_existing, 'duplicate', true);
end $$;
revoke all on function public.create_order_record(jsonb) from public, anon, authenticated;
grant execute on function public.create_order_record(jsonb) to service_role;

-- Pago confirmado por Stripe (solo desde el webhook verificado).
create or replace function public.mark_stripe_session_paid(p_session text, p_amount int, p_currency text, p_intent text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_pay record;
  v_status text;
begin
  select id, order_id, amount_cents, status into v_pay
    from public.payments where stripe_session_id = p_session for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if v_pay.status = 'paid' then
    return jsonb_build_object('found', true, 'already', true, 'order_id', v_pay.order_id);
  end if;
  if p_amount is distinct from v_pay.amount_cents or lower(coalesce(p_currency, 'eur')) <> 'eur' then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;
  update public.payments
     set status = 'paid', paid_at = now(), stripe_payment_intent = p_intent
   where id = v_pay.id;
  v_status := public.sync_order_paid_status(v_pay.order_id);
  return jsonb_build_object('found', true, 'already', false, 'order_id', v_pay.order_id,
                            'amount_cents', v_pay.amount_cents, 'order_status', v_status);
end $$;
revoke all on function public.mark_stripe_session_paid(text, int, text, text) from public, anon, authenticated;
grant execute on function public.mark_stripe_session_paid(text, int, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 5. Resumen para el panel (aplica RLS: solo administradores ven datos)
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'requests_total',        (select count(*) from requests),
    'requests_new',          (select count(*) from requests where status = 'nueva'),
    'requests_last_7d',      (select count(*) from requests where created_at > now() - interval '7 days'),
    'quotes_sent',           (select count(*) from requests where status = 'presupuesto_enviado'),
    'accepted',              (select count(*) from requests where status = 'aceptada'),
    'in_development',        (select count(*) from requests where status = 'en_desarrollo'),
    'delivered',             (select count(*) from requests where status = 'entregada'),
    'calls_pending',         (select count(*) from bookings where status = 'confirmed' and starts_at > now()),
    'calls_to_review',       (select count(*) from bookings where status = 'confirmed' and starts_at <= now()),
    'calls_done',            (select count(*) from bookings where status = 'completed'),
    'orders_total',          (select count(*) from orders where status <> 'cancelled'),
    'orders_paid',           (select count(*) from orders where status in ('paid','deposit_paid','in_progress','delivered')),
    'payments_confirmed',    (select count(*) from payments where status = 'paid'),
    'revenue_cents',         (select coalesce(sum(amount_cents), 0) from payments where status = 'paid'),
    'revenue_stripe_cents',  (select coalesce(sum(amount_cents), 0) from payments where status = 'paid' and provider = 'stripe'),
    'pending_cents',         (select coalesce(sum(o.total_cents - coalesce(p.paid, 0)), 0)
                                from orders o
                                left join (select order_id, sum(amount_cents) paid from payments
                                            where status = 'paid' group by order_id) p on p.order_id = o.id
                               where o.status not in ('cancelled','payment_failed')),
    'awaiting_quote',        (select count(*) from orders where status = 'awaiting_quote')
  ) into r;
  return r;
end $$;
revoke all on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;

revoke all on public.requests_overview from anon;
