-- ============================================================================
-- Migración 0005: entrar con nombre de usuario en vez de correo
--
-- La cajera y los repartidores no tienen por qué tener un correo para usar el
-- sistema, ni el dueño tiene por qué pedírselo. A partir de ahora se entra con
-- un nombre de usuario ("genesis") y una clave.
--
-- Por debajo sigue siendo el correo lo que guarda Supabase, porque es lo que su
-- sistema de autenticación necesita: la app le pega un dominio interno
-- (genesis@broaster.local) que nunca se usa para enviar nada. Quien sí tenga
-- correo real, como el dueño, puede seguir entrando con él.
--
-- Esta columna guarda ese nombre de usuario para poder mostrarlo en
-- Configuración: hace falta para decirle a cada quien con qué debe entrar.
-- ============================================================================

alter table usuarios add column if not exists usuario text;

comment on column usuarios.usuario is
  'Nombre con el que la persona entra. Es la parte del correo antes de la arroba.';

-- Rellenar los que ya existen.
update usuarios u
set usuario = split_part(a.email, '@', 1)
from auth.users a
where a.id = u.id and u.usuario is null;

-- No lleva restricción de unicidad a propósito: la unicidad real la impone
-- `auth.users.email`, que es lo que de verdad se usa para entrar.
create index if not exists usuarios_usuario_idx on usuarios (usuario);

-- El trigger de alta ahora también guarda el nombre de usuario.
create or replace function manejar_usuario_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  es_el_primero boolean;
  nombre_usuario text := split_part(new.email, '@', 1);
begin
  -- ¿Ya hay alguien que pueda administrar el sistema?
  select not exists (select 1 from usuarios where rol = 'admin' and activo)
    into es_el_primero;

  insert into usuarios (id, nombre, usuario, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', nombre_usuario),
    nombre_usuario,
    case when es_el_primero then 'admin' else 'cajera' end::rol_usuario,
    es_el_primero
  );
  return new;
end;
$$;
