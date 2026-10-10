-- Datos SOLO para pruebas locales: un administrador y un usuario sin permisos.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@prueba.local'),
  ('22222222-2222-2222-2222-222222222222', 'intruso@prueba.local');
insert into public.admins (user_id) values ('11111111-1111-1111-1111-111111111111');
-- Reservas activas todos los días de 09:00 a 21:00, sin antelación mínima.
update public.booking_settings set enabled = true, min_notice_min = 0, buffer_min = 5, duration_min = 15,
  weekly_hours = '{"1":[{"start":"09:00","end":"21:00"}],"2":[{"start":"09:00","end":"21:00"}],"3":[{"start":"09:00","end":"21:00"}],"4":[{"start":"09:00","end":"21:00"}],"5":[{"start":"09:00","end":"21:00"}],"6":[{"start":"09:00","end":"21:00"}],"7":[{"start":"09:00","end":"21:00"}]}'::jsonb
 where id = 1;
update public.site_settings set contact_email = 'hola@prueba.local', whatsapp = '+34 600 000 000' where id = 1;
