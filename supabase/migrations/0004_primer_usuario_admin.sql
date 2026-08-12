-- ============================================================================
-- Migración 0004: el primer usuario entra como administrador
--
-- Hasta ahora todo el que se registraba quedaba como cajera e inactivo, y hacía
-- falta entrar a Supabase a activarlo. Para el primer usuario eso es una trampa:
-- no hay ningún administrador todavía que pueda activarlo, así que el arranque
-- dependía de editar la base a mano — justo el paso donde es fácil borrar la
-- fila equivocada y quedarse afuera del sistema.
--
-- Ahora, si no existe ningún administrador activo, el que se registra lo es. A
-- partir del segundo, se sigue entrando desactivado y es el administrador quien
-- da el acceso desde Configuración.
--
-- Se puede ejecutar sobre una base que ya está andando: solo reemplaza la
-- función, no toca los datos.
-- ============================================================================

create or replace function manejar_usuario_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  es_el_primero boolean;
begin
  -- ¿Ya hay alguien que pueda administrar el sistema?
  select not exists (select 1 from usuarios where rol = 'admin' and activo)
    into es_el_primero;

  insert into usuarios (id, nombre, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    case when es_el_primero then 'admin' else 'cajera' end::rol_usuario,
    es_el_primero
  );
  return new;
end;
$$;
