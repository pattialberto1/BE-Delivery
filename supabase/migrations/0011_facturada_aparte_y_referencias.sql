-- ============================================================================
-- Migración 0011: comandas facturadas aparte, y las referencias en la vista
--
-- 1) Hay comandas de delivery que el cliente necesita con factura fiscal. Esas
--    se facturan por la caja normal del local, no por la del delivery. La
--    comanda existe, el repartidor la lleva y hay que pagarle su carrera, pero
--    la plata nunca pasó por la caja del delivery: no puede sumar en el cierre
--    ni en ningún total de caja. Va marcada y se reporta aparte.
--
-- 2) El número de referencia vivía solo en la tabla `pagos`. Cada pantalla que
--    muestra una factura tenía que salir a buscarlo por su cuenta, o no lo
--    mostraba. Se agrega a la vista para que salga siempre al lado del número
--    de factura, que es como se coteja contra el banco.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La marca de facturada aparte
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
-- 2. La vista trae la marca y las referencias de los pagos
-- ---------------------------------------------------------------------------

drop view v_ordenes_detalle;

create view v_ordenes_detalle
with (security_invoker = true) as
select
  o.id,
  o.fecha_operativa,
  o.numero_factura,
  o.tipo,
  o.facturada_aparte,
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
