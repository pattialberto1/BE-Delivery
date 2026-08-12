-- ============================================================================
-- Broaster Express La Candelaria — Sistema de Delivery
-- Migración 0001: esquema inicial
--
-- Ejecutar en Supabase: SQL Editor -> pegar este archivo -> Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type rol_usuario as enum ('cajera', 'admin', 'dueno');

create type estado_orden as enum ('pendiente', 'verificada', 'anulada');

create type metodo_pago as enum (
  'pago_movil',
  'transferencia',
  'efectivo_bs',
  'efectivo_usd',
  'zelle',
  'binance',
  'punto_venta'
);

create type moneda as enum ('BS', 'USD');

-- ---------------------------------------------------------------------------
-- Usuarios y roles
--
-- Se apoya en auth.users de Supabase; esta tabla solo agrega nombre y rol.
-- ---------------------------------------------------------------------------

create table usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  rol rol_usuario not null default 'cajera',
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Al registrarse un usuario nuevo en Auth se crea su fila aquí automáticamente.
-- Entra como 'cajera' e inactivo: un admin debe activarlo. Así, que alguien
-- consiga la URL de la app no le alcanza para entrar a ver datos.
create function manejar_usuario_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into usuarios (id, nombre, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    'cajera',
    false
  );
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function manejar_usuario_nuevo();

-- Helpers de rol. SECURITY DEFINER para que las políticas RLS puedan leer
-- `usuarios` sin caer en recursión infinita contra sus propias políticas.
create function mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from usuarios where id = auth.uid() and activo;
$$;

create function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol() = 'admin', false);
$$;

create function puede_escribir() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol() in ('cajera', 'admin'), false);
$$;

-- ---------------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------------

create table zonas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- Lo que se le cobra al cliente y lo que se le paga al repartidor son
  -- montos distintos; la diferencia es el margen del delivery.
  tarifa_cliente_usd numeric(10, 2) not null check (tarifa_cliente_usd >= 0),
  pago_repartidor_usd numeric(10, 2) not null check (pago_repartidor_usd >= 0),
  orden int not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table repartidores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table bancos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  codigo text,
  activo boolean not null default true,
  orden int not null default 0
);

-- Cuentas propias del local: dónde CAE la plata.
--
-- Es la columna "BANCO" de la hoja de papel (BP, BB…). No es el banco del
-- cliente: es a cuál de nuestras cuentas entró el pago, que es el dato que hace
-- falta para saber en qué banco entrar a confirmarlo y para cuadrar después
-- contra el estado de cuenta.
create table cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- Cómo se abrevia en la hoja de papel, para que la cajera reconozca lo mismo.
  abreviatura text not null unique,
  banco_id uuid references bancos (id),
  -- Teléfono del pago móvil y últimos dígitos de la cuenta, como referencia
  -- rápida para la cajera cuando el cliente pregunta a dónde enviar.
  telefono_pago_movil text,
  numero text,
  activo boolean not null default true,
  orden int not null default 0
);

-- Una tasa por día. El delivery está tarifado en USD pero el pago móvil
-- entra en Bs, así que hace falta el puente para cuadrar la caja.
create table tasas_cambio (
  fecha date primary key,
  bs_por_usd numeric(14, 4) not null check (bs_por_usd > 0),
  cargada_por uuid references usuarios (id),
  cargada_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Órdenes
-- ---------------------------------------------------------------------------

create table ordenes (
  id uuid primary key default gen_random_uuid(),

  -- Fecha operativa, no la del reloj: una orden facturada a la 1 a.m. pertenece
  -- al día anterior. La calcula la app según la hora de corte configurada.
  fecha_operativa date not null,

  -- El número lo emite el sistema de comandas de la tablet; aquí solo se copia
  -- y se valida. Único dentro del día operativo.
  numero_factura text not null,

  cliente_nombre text not null,
  cliente_telefono text,
  direccion text not null,

  zona_id uuid not null references zonas (id),
  -- Las tarifas se copian dentro de la orden a propósito: si mañana suben los
  -- precios de las zonas, las órdenes viejas conservan lo que realmente se
  -- cobró y se pagó ese día, y los reportes históricos no se mueven.
  tarifa_cliente_usd numeric(10, 2) not null check (tarifa_cliente_usd >= 0),
  pago_repartidor_usd numeric(10, 2) not null check (pago_repartidor_usd >= 0),

  repartidor_id uuid references repartidores (id),

  -- Monto del pedido sin el delivery, en USD.
  monto_pedido_usd numeric(10, 2) not null check (monto_pedido_usd >= 0),
  tasa_bs_por_usd numeric(14, 4) not null check (tasa_bs_por_usd > 0),

  estado estado_orden not null default 'pendiente',
  motivo_anulacion text,
  notas text,

  verificada_por uuid references usuarios (id),
  verificada_en timestamptz,

  creada_por uuid not null references usuarios (id),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),

  constraint factura_unica_por_dia unique (fecha_operativa, numero_factura),
  constraint anulada_requiere_motivo check (
    estado <> 'anulada' or (motivo_anulacion is not null and motivo_anulacion <> '')
  )
);

create index ordenes_fecha_idx on ordenes (fecha_operativa desc);
create index ordenes_repartidor_idx on ordenes (repartidor_id, fecha_operativa);
create index ordenes_estado_idx on ordenes (fecha_operativa, estado);

-- Total que el cliente debe pagar: pedido + delivery.
create function total_orden_usd(ordenes) returns numeric
language sql immutable as $$
  select $1.monto_pedido_usd + $1.tarifa_cliente_usd;
$$;

-- ---------------------------------------------------------------------------
-- Pagos
--
-- Tabla aparte porque en la práctica un cliente paga mezclado: una parte por
-- pago móvil y otra en efectivo. El cuadro de papel no contemplaba ese caso.
-- ---------------------------------------------------------------------------

create table pagos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes (id) on delete cascade,

  metodo metodo_pago not null,
  -- A cuál de nuestras cuentas entró la plata (la columna "BANCO" del papel).
  cuenta_id uuid references cuentas (id),
  -- Banco desde el que el cliente envió, si la captura lo muestra. Opcional:
  -- para verificar hace falta saber dónde cayó, no de dónde salió.
  banco_id uuid references bancos (id),
  referencia text,
  -- Teléfono o cédula del emisor, según lo que muestre la captura.
  emisor text,

  monto numeric(14, 2) not null check (monto > 0),
  moneda moneda not null,

  -- Ruta dentro del bucket 'capturas' de Supabase Storage.
  imagen_path text,

  creado_en timestamptz not null default now(),

  -- El efectivo no tiene referencia que verificar; el resto sí.
  constraint referencia_obligatoria check (
    metodo in ('efectivo_bs', 'efectivo_usd')
    or (referencia is not null and referencia <> '')
  ),

  -- Un pago móvil o una transferencia siempre cayeron en alguna cuenta nuestra;
  -- sin ese dato no hay dónde ir a confirmarlos.
  constraint cuenta_obligatoria check (
    metodo not in ('pago_movil', 'transferencia') or cuenta_id is not null
  )
);

create index pagos_orden_idx on pagos (orden_id);
create index pagos_referencia_idx on pagos (referencia) where referencia is not null;

-- ---------------------------------------------------------------------------
-- Unicidad de las referencias
--
-- En la hoja de papel se anotan solo los ÚLTIMOS 4 DÍGITOS de la referencia
-- completa, porque copiarla entera a mano es lento. La app acepta las dos
-- formas: la completa o el recorte de siempre.
--
-- Con 4 dígitos hay apenas 10.000 valores posibles, así que con el volumen de
-- una semana que dos pagos distintos terminen en los mismos 4 números es
-- esperable, no raro. Por eso NO se puede exigir unicidad sobre cualquier
-- referencia: rechazaría pagos legítimos y dejaría a la cajera trancada con el
-- cliente en línea.
--
-- La unicidad se exige solo cuando la referencia viene completa (8 dígitos o
-- más), donde una repetición sí delata la misma captura mandada dos veces. Para
-- los recortes, la app avisa en pantalla mostrando la factura y el monto en
-- conflicto, y la cajera decide — que es justo lo que hoy no puede hacer.
-- ---------------------------------------------------------------------------

create unique index pagos_referencia_larga_unica
  on pagos (cuenta_id, referencia)
  where referencia is not null and cuenta_id is not null and length(referencia) >= 8;

-- ---------------------------------------------------------------------------
-- Cierre del día
-- ---------------------------------------------------------------------------

create table cierres (
  fecha_operativa date primary key,
  cerrado_por uuid not null references usuarios (id),
  cerrado_en timestamptz not null default now(),
  totales jsonb not null default '{}'::jsonb,
  notas text
);

-- Un día cerrado queda congelado: nadie puede seguir tocando esas órdenes.
create function bloquear_dia_cerrado() returns trigger
language plpgsql as $$
declare
  fecha date := coalesce(new.fecha_operativa, old.fecha_operativa);
begin
  if exists (select 1 from cierres where fecha_operativa = fecha) then
    raise exception 'El día % ya está cerrado. Un administrador debe reabrirlo para modificarlo.', fecha
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger ordenes_dia_cerrado
  before insert or update or delete on ordenes
  for each row execute function bloquear_dia_cerrado();

create function bloquear_pago_dia_cerrado() returns trigger
language plpgsql as $$
declare
  fecha date;
begin
  select o.fecha_operativa into fecha
  from ordenes o
  where o.id = coalesce(new.orden_id, old.orden_id);

  if fecha is not null and exists (select 1 from cierres where fecha_operativa = fecha) then
    raise exception 'El día % ya está cerrado. Un administrador debe reabrirlo para modificarlo.', fecha
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger pagos_dia_cerrado
  before insert or update or delete on pagos
  for each row execute function bloquear_pago_dia_cerrado();

-- ---------------------------------------------------------------------------
-- Auditoría — quién cambió qué y cuándo
-- ---------------------------------------------------------------------------

create table auditoria (
  id bigserial primary key,
  usuario_id uuid references usuarios (id),
  tabla text not null,
  registro_id uuid,
  accion text not null,
  antes jsonb,
  despues jsonb,
  cuando timestamptz not null default now()
);

create index auditoria_registro_idx on auditoria (tabla, registro_id, cuando desc);

create function registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (usuario_id, tabla, registro_id, accion, antes, despues)
  values (
    auth.uid(),
    tg_table_name,
    coalesce((new.id)::uuid, (old.id)::uuid),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger ordenes_auditoria
  after insert or update or delete on ordenes
  for each row execute function registrar_auditoria();

create trigger pagos_auditoria
  after insert or update or delete on pagos
  for each row execute function registrar_auditoria();

create function tocar_actualizada_en() returns trigger
language plpgsql as $$
begin
  new.actualizada_en := now();
  return new;
end;
$$;

create trigger ordenes_actualizada_en
  before update on ordenes
  for each row execute function tocar_actualizada_en();

-- ---------------------------------------------------------------------------
-- Vistas de reporte
--
-- La liquidación se calcula en SQL, no en el navegador: así el número que ve
-- la administradora y el que sale en el Excel salen siempre de la misma cuenta.
-- ---------------------------------------------------------------------------

create view v_ordenes_detalle
with (security_invoker = true) as
select
  o.id,
  o.fecha_operativa,
  o.numero_factura,
  o.cliente_nombre,
  o.cliente_telefono,
  o.direccion,
  z.nombre as zona,
  o.tarifa_cliente_usd,
  o.pago_repartidor_usd,
  o.tarifa_cliente_usd - o.pago_repartidor_usd as margen_delivery_usd,
  r.nombre as repartidor,
  o.repartidor_id,
  o.monto_pedido_usd,
  o.monto_pedido_usd + o.tarifa_cliente_usd as total_usd,
  o.tasa_bs_por_usd,
  o.estado,
  o.notas,
  u.nombre as cargada_por,
  o.creada_en,
  -- Lo pagado se normaliza a USD con la tasa de la propia orden para poder
  -- compararlo contra el total sin importar en qué moneda entró cada pago.
  coalesce(p.pagado_usd, 0) as pagado_usd,
  round(coalesce(p.pagado_usd, 0) - (o.monto_pedido_usd + o.tarifa_cliente_usd), 2) as diferencia_usd,
  coalesce(p.cantidad_pagos, 0) as cantidad_pagos
from ordenes o
join zonas z on z.id = o.zona_id
left join repartidores r on r.id = o.repartidor_id
left join usuarios u on u.id = o.creada_por
left join lateral (
  select
    sum(case when pg.moneda = 'USD' then pg.monto else pg.monto / o.tasa_bs_por_usd end) as pagado_usd,
    count(*) as cantidad_pagos
  from pagos pg
  where pg.orden_id = o.id
) p on true
where o.estado <> 'anulada';

-- El cuadro que hoy la administradora arma a mano al final del día.
create view v_liquidacion_repartidores
with (security_invoker = true) as
select
  o.fecha_operativa,
  o.repartidor_id,
  r.nombre as repartidor,
  count(*) as carreras,
  sum(o.pago_repartidor_usd) as total_pagar_usd,
  sum(o.tarifa_cliente_usd) as total_cobrado_usd,
  sum(o.tarifa_cliente_usd - o.pago_repartidor_usd) as margen_usd
from ordenes o
join repartidores r on r.id = o.repartidor_id
where o.estado <> 'anulada'
group by o.fecha_operativa, o.repartidor_id, r.nombre;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Cajera: carga y edita el día en curso. Admin: todo. Dueño: solo lectura.
-- ---------------------------------------------------------------------------

alter table usuarios enable row level security;
alter table zonas enable row level security;
alter table repartidores enable row level security;
alter table bancos enable row level security;
alter table cuentas enable row level security;
alter table tasas_cambio enable row level security;
alter table ordenes enable row level security;
alter table pagos enable row level security;
alter table cierres enable row level security;
alter table auditoria enable row level security;

-- Usuarios: cada quien se ve a sí mismo; el admin ve y administra a todos.
create policy usuarios_ver_propio on usuarios for select
  using (id = auth.uid() or es_admin());
create policy usuarios_admin_inserta on usuarios for insert
  with check (es_admin());
create policy usuarios_admin_edita on usuarios for update
  using (es_admin()) with check (es_admin());
create policy usuarios_admin_borra on usuarios for delete
  using (es_admin());

-- Catálogos: los lee cualquier usuario activo; solo el admin los modifica.
create policy zonas_leer on zonas for select using (mi_rol() is not null);
create policy zonas_admin on zonas for all
  using (es_admin()) with check (es_admin());

create policy repartidores_leer on repartidores for select using (mi_rol() is not null);
create policy repartidores_admin on repartidores for all
  using (es_admin()) with check (es_admin());

create policy bancos_leer on bancos for select using (mi_rol() is not null);
create policy bancos_admin on bancos for all
  using (es_admin()) with check (es_admin());

create policy cuentas_leer on cuentas for select using (mi_rol() is not null);
create policy cuentas_admin on cuentas for all
  using (es_admin()) with check (es_admin());

-- La tasa del día la puede cargar la cajera al abrir; el admin la corrige.
create policy tasas_leer on tasas_cambio for select using (mi_rol() is not null);
create policy tasas_escribir on tasas_cambio for insert with check (puede_escribir());
create policy tasas_editar on tasas_cambio for update
  using (es_admin()) with check (es_admin());

-- Órdenes: todos los roles las leen (el dueño para sus reportes).
create policy ordenes_leer on ordenes for select using (mi_rol() is not null);
create policy ordenes_crear on ordenes for insert with check (puede_escribir());
-- La cajera solo corrige lo que aún no está verificado; una vez que la
-- administradora aprueba una orden, solo ella puede volver a tocarla.
create policy ordenes_editar on ordenes for update
  using (es_admin() or (puede_escribir() and estado = 'pendiente'))
  with check (es_admin() or (puede_escribir() and estado <> 'verificada'));
create policy ordenes_borrar on ordenes for delete using (es_admin());

create policy pagos_leer on pagos for select using (mi_rol() is not null);
create policy pagos_crear on pagos for insert with check (
  puede_escribir()
  and exists (
    select 1 from ordenes o
    where o.id = orden_id and (es_admin() or o.estado = 'pendiente')
  )
);
create policy pagos_editar on pagos for update
  using (
    puede_escribir()
    and exists (
      select 1 from ordenes o
      where o.id = orden_id and (es_admin() or o.estado = 'pendiente')
    )
  )
  with check (puede_escribir());
create policy pagos_borrar on pagos for delete using (
  puede_escribir()
  and exists (
    select 1 from ordenes o
    where o.id = orden_id and (es_admin() or o.estado = 'pendiente')
  )
);

-- Cerrar el día es acto de la administradora, no de la cajera.
create policy cierres_leer on cierres for select using (mi_rol() is not null);
create policy cierres_admin on cierres for all
  using (es_admin()) with check (es_admin());

-- La auditoría es solo para el admin y nadie la escribe a mano
-- (la escribe el trigger, que corre como SECURITY DEFINER).
create policy auditoria_leer on auditoria for select using (es_admin());
