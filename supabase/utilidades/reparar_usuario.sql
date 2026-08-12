-- ============================================================================
-- Reparar un usuario que quedó sin fila en `usuarios`
--
-- Sirve cuando alguien se registró en la app pero no aparece en Configuración,
-- típicamente porque se borró su fila de `usuarios` a mano. El usuario de
-- autenticación sigue existiendo, pero la fila solo se crea al registrarse, así
-- que volver a registrarse con el mismo correo ya no la recrea.
--
-- Ejecutar en Supabase: SQL Editor -> pegar -> Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PASO 1 — Ver qué hay realmente
--
-- `rol` en blanco significa que el usuario existe en autenticación pero le
-- falta la fila. Eso es lo que arregla el paso 2.
-- ---------------------------------------------------------------------------

select
  a.email,
  a.id,
  u.nombre,
  u.rol,
  u.activo,
  case when u.id is null then 'FALTA la fila en usuarios' else 'completo' end as estado
from auth.users a
left join public.usuarios u on u.id = a.id
order by a.created_at;

-- ---------------------------------------------------------------------------
-- PASO 2 — Dejarlo como administrador activo
--
-- Cambiar el correo por el tuyo antes de ejecutar.
-- Funciona en los dos casos: si falta la fila la crea, y si existe la corrige.
-- ---------------------------------------------------------------------------

insert into public.usuarios (id, nombre, rol, activo)
select
  a.id,
  coalesce(a.raw_user_meta_data ->> 'nombre', split_part(a.email, '@', 1)),
  'admin',
  true
from auth.users a
where a.email = 'CAMBIAR@POR-TU-CORREO.com'
on conflict (id) do update
  set rol = 'admin',
      activo = true;

-- ---------------------------------------------------------------------------
-- PASO 3 — Confirmar
-- ---------------------------------------------------------------------------

select a.email, u.nombre, u.rol, u.activo
from public.usuarios u
join auth.users a on a.id = u.id;

-- ============================================================================
-- Si lo que quieres es empezar de cero con ese correo, borra el usuario desde
-- Authentication -> Users (no desde la tabla `usuarios`). Al borrarlo de ahí se
-- borra también su fila, y al registrarse de nuevo todo se recrea solo.
-- ============================================================================
