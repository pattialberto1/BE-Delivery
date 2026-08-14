-- ============================================================================
-- Migración 0010: en qué moneda se pagó cada carrera, y liberar la factura
--                 de las órdenes anuladas
--
-- 1) Al repartidor hay que pagarle con la plata que entró, así que la
--    liquidación y el cierre tienen que decir qué carreras se cobraron en
--    dólares y cuáles en bolívares. La vista ya traía el total normalizado a
--    dólares, pero no de dónde salía.
--
-- 2) Si la cajera se equivoca de número de factura y anula esa orden, el número
--    quedaba bloqueado para siempre: la restricción de unicidad no miraba el
--    estado. Una orden anulada no existe para efectos del correlativo, así que
--    su número tiene que poder volver a usarse.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La factura de una orden anulada vuelve a estar libre
-- ---------------------------------------------------------------------------

alter table ordenes drop constraint if exists factura_unica_por_dia;

-- Se conserva el nombre para que el mensaje de error que muestra la app siga
-- reconociéndolo.
create unique index factura_unica_por_dia
  on ordenes (fecha_operativa, numero_factura)
  where estado <> 'anulada';

-- ---------------------------------------------------------------------------
-- 2. La vista dice cuánto entró en cada moneda
-- ---------------------------------------------------------------------------

drop view v_ordenes_detalle;

create view v_ordenes_detalle
with (security_invoker = true) as
select
  o.id,
  o.fecha_operativa,
  o.numero_factura,
  o.tipo,
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
  coalesce(p.cantidad_pagos, 0) as cantidad_pagos
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
    count(*) as cantidad_pagos
  from pagos pg
  where pg.orden_id = o.id
) p on true
where o.estado <> 'anulada';
