-- Bucket público para el logotipo y las imágenes de los proyectos de demostración.
-- Las subidas se hacen desde el servidor (panel de admin) con la clave service_role.
insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

create policy "public read public-assets"
  on storage.objects for select
  using (bucket_id = 'public-assets');
