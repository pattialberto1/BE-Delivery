-- ============================================================================
-- Migración 0009: en los reportes se llama "Pick Up", no "Retiro en el local"
--
-- Es el nombre con el que se le dice en el local, y en los reportes conviene que
-- diga lo mismo que dice la gente.
--
-- La 0008 ya quedó corregida para las instalaciones nuevas. Esta migración
-- existe para las que la ejecutaron antes del cambio: solo redefine la vista, no
-- toca ningún dato.
-- ============================================================================

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
    count(*) as cantidad_pagos
  from pagos pg
  where pg.orden_id = o.id
) p on true
where o.estado <> 'anulada';
