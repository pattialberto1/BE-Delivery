-- ============================================================================
-- Migración 0002: bucket de capturas de pago
--
-- Las capturas de pantalla del pago móvil son el respaldo ante cualquier
-- reclamo, así que el bucket es privado: se leen con URL firmada temporal,
-- nunca por link público.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capturas',
  'capturas',
  false,
  5 * 1024 * 1024, -- 5 MB: una captura de teléfono pesa mucho menos
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cualquier usuario activo puede ver las capturas (la administradora las
-- necesita para verificar, el dueño para auditar).
create policy capturas_leer on storage.objects for select
  using (bucket_id = 'capturas' and mi_rol() is not null);

create policy capturas_subir on storage.objects for insert
  with check (bucket_id = 'capturas' and puede_escribir());

-- Borrar un comprobante ya cargado es cosa de administración.
create policy capturas_borrar on storage.objects for delete
  using (bucket_id = 'capturas' and es_admin());
