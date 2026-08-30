-- ============================================================================
-- Poner la base al día, de una sola vez
--
-- Hace lo mismo que las migraciones 0010, 0011, 0012 y 0013 juntas, sin
-- importar en cuál de ellas se haya quedado la base y sin importar cuántas
-- veces se ejecute: si algo ya está hecho, lo salta.
--
-- Existe porque las migraciones hay que correrlas en orden, y saltarse una da
-- un error que no dice cuál falta:
--
--     ERROR: column o.moneda_facturada does not exist
--
-- Ese mensaje no señala la 0012, que es la que agrega esa columna. Con este
-- archivo no hay orden que respetar: se pega entero en el SQL Editor de
-- Supabase, se ejecuta, y al final dice cómo quedó.
--
-- Requisito: la base tiene que tener al menos hasta la 0009 (los pick up).
-- Para una instalación nueva se corren las migraciones en orden y ya; esto es
-- para las que vienen de atrás.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0010 · La factura de una orden anulada vuelve a estar libre
-- ---------------------------------------------------------------------------

alter table ordenes drop constraint if exists factura_unica_por_dia;

-- Se conserva el nombre para que el mensaje de error que muestra la app siga
-- reconociéndolo.
create unique index if not exists factura_unica_por_dia
  on ordenes (fecha_operativa, numero_factura)
  where estado <> 'anulada';

-- ---------------------------------------------------------------------------
-- 0011 · Comandas facturadas por la caja del local
-- ---------------------------------------------------------------------------

alter table ordenes
  add column if not exists facturada_aparte boolean not null default false;

comment on column ordenes.facturada_aparte is
  'La comanda se facturó por la caja del local (factura fiscal). Es delivery y '
  'se le paga la carrera al repartidor, pero su dinero no entra en la caja del '
  'delivery y no suma en el cierre.';

-- Un pick up se cobra en el local por definición; la marca solo tiene sentido
-- en un delivery.
alter table ordenes drop constraint if exists facturada_solo_delivery;
alter table ordenes add constraint facturada_solo_delivery
  check (not facturada_aparte or tipo = 'delivery');

-- ---------------------------------------------------------------------------
-- 0012 · Con qué moneda cobró la caja del local
-- ---------------------------------------------------------------------------

alter table ordenes
  add column if not exists moneda_facturada text;

comment on column ordenes.moneda_facturada is
  'Con qué moneda pagó el cliente una comanda facturada aparte: BS, USD o '
  'MIXTO (parte y parte). Solo aplica cuando facturada_aparte es verdadero.';

alter table ordenes drop constraint if exists moneda_facturada_valida;
alter table ordenes add constraint moneda_facturada_valida
  check (
    (moneda_facturada is null or moneda_facturada in ('BS', 'USD', 'MIXTO'))
    and (facturada_aparte or moneda_facturada is null)
  );

-- ---------------------------------------------------------------------------
-- 0013 · Cuánto de cada moneda cuando fue parte y parte
-- ---------------------------------------------------------------------------

alter table ordenes
  add column if not exists facturada_bs numeric(14, 2),
  add column if not exists facturada_divisa_usd numeric(12, 2);

comment on column ordenes.facturada_bs is
  'Bolívares que cobró la caja del local por una comanda facturada aparte '
  'pagada parte y parte. No suma en la caja del delivery.';
comment on column ordenes.facturada_divisa_usd is
  'Dólares que cobró la caja del local por una comanda facturada aparte '
  'pagada parte y parte. No suma en la caja del delivery.';

alter table ordenes drop constraint if exists montos_facturada_validos;
alter table ordenes add constraint montos_facturada_validos
  check (
    coalesce(facturada_bs, 0) >= 0
    and coalesce(facturada_divisa_usd, 0) >= 0
    and (facturada_aparte or (facturada_bs is null and facturada_divisa_usd is null))
  );

-- ---------------------------------------------------------------------------
-- La vista, en su forma final
--
-- Se arma una sola vez al final en vez de una por migración: el resultado es el
-- mismo y así no hay orden que respetar.
-- ---------------------------------------------------------------------------

drop view if exists v_ordenes_detalle;

create view v_ordenes_detalle
with (security_invoker = true) as
select
  o.id,
  o.fecha_operativa,
  o.numero_factura,
  o.tipo,
  o.facturada_aparte,
  o.moneda_facturada,
  o.facturada_bs,
  o.facturada_divisa_usd,
  o.cliente_nombre,
  o.cliente_telefono,
  o.direccion,
  -- Los pick up no tienen zona; se nombran para que el reporte se lea solo.
  coalesce(z.nombre, 'Pick Up') as zona,
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
  -- Y además se guarda separado lo que entró en cada moneda, tal cual entró:
  -- es lo que dice con qué plata se le paga al repartidor.
  coalesce(p.pagado_divisa, 0) as pagado_divisa_usd,
  coalesce(p.pagado_bolivares, 0) as pagado_bs,
  round(coalesce(p.pagado_usd, 0) - (o.monto_pedido_usd + o.tarifa_cliente_usd), 2) as diferencia_usd,
  coalesce(p.cantidad_pagos, 0) as cantidad_pagos,
  -- Las referencias de la orden, en el orden en que se cargaron. El efectivo no
  -- tiene, así que se filtra: si no, quedarían separadores sueltos.
  p.referencias
from ordenes o
-- LEFT y no JOIN: con un JOIN los pick up desaparecerían del cierre.
left join zonas z on z.id = o.zona_id
left join repartidores r on r.id = o.repartidor_id
left join usuarios u on u.id = o.creada_por
left join lateral (
  select
    sum(case when pg.moneda = 'USD' then pg.monto else pg.monto / o.tasa_bs_por_usd end) as pagado_usd,
    sum(case when pg.moneda = 'USD' then pg.monto else 0 end) as pagado_divisa,
    sum(case when pg.moneda = 'BS' then pg.monto else 0 end) as pagado_bolivares,
    count(*) as cantidad_pagos,
    string_agg(pg.referencia, ' · ' order by pg.creado_en)
      filter (where pg.referencia is not null and pg.referencia <> '') as referencias
  from pagos pg
  where pg.orden_id = o.id
) p on true
where o.estado <> 'anulada';

commit;

-- ---------------------------------------------------------------------------
-- Cómo quedó
-- ---------------------------------------------------------------------------

select
  'Base al día' as resultado,
  count(*) filter (where column_name = 'facturada_aparte') as facturada_aparte,
  count(*) filter (where column_name = 'moneda_facturada') as moneda_facturada,
  count(*) filter (where column_name = 'facturada_bs') as facturada_bs,
  count(*) filter (where column_name = 'facturada_divisa_usd') as facturada_divisa_usd
from information_schema.columns
where table_name = 'ordenes'
  and column_name in ('facturada_aparte', 'moneda_facturada', 'facturada_bs', 'facturada_divisa_usd');

-- Las cuatro columnas tienen que dar 1. Si alguna da 0, algo se quedó a medias:
-- vuelve a ejecutar este mismo archivo.
