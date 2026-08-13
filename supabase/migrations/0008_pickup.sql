-- ============================================================================
-- Migración 0008: pedidos para retirar en el local (pick up)
--
-- El cliente pide y paga por teléfono, y después pasa por el local a buscarlo.
-- No hay entrega, así que no hay zona, ni tarifa de delivery, ni repartidor.
--
-- Aun así entran en el cierre de caja: la plata la recibe la misma cajera y
-- tiene que cuadrar junto con todo lo demás. Lo que NO hacen es contar como
-- delivery: no aparecen en la liquidación de repartidores ni en el desglose por
-- zona, porque nadie hizo una carrera por ellos.
-- ============================================================================

create type tipo_orden as enum ('delivery', 'pickup');

alter table ordenes add column tipo tipo_orden not null default 'delivery';

comment on column ordenes.tipo is
  'delivery = se lleva a domicilio; pickup = el cliente lo retira en el local.';

-- Un pick up no tiene zona, así que la columna deja de ser obligatoria.
alter table ordenes alter column zona_id drop not null;

-- Cada tipo tiene su forma: el delivery necesita zona, el pick up no puede
-- tener ni zona, ni tarifa, ni repartidor. Dejarlo escrito evita que un pick up
-- termine cobrando delivery por un descuido de pantalla.
alter table ordenes add constraint forma_segun_tipo check (
  (tipo = 'delivery' and zona_id is not null)
  or (
    tipo = 'pickup'
    and zona_id is null
    and repartidor_id is null
    and tarifa_cliente_usd = 0
    and pago_repartidor_usd = 0
  )
);

-- ---------------------------------------------------------------------------
-- La vista de detalle: ahora la zona puede faltar
--
-- Se recrea entera en vez de reemplazarla porque cambia la lista de columnas.
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
