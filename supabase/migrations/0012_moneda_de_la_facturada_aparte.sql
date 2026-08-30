-- ============================================================================
-- Migración 0012: con qué moneda se cobró una comanda facturada aparte
--
-- La comanda facturada por la caja del local no lleva pagos en este sistema,
-- así que no había forma de saber si el cliente pagó en bolívares, en dólares o
-- parte y parte. Y hace falta: la carrera del repartidor se paga con la plata
-- que entró, igual que en las demás.
--
-- Su dinero sigue sin sumar en ningún total de la caja del delivery. Esto es
-- solo la marca de en qué moneda entró.
-- ============================================================================

alter table ordenes
  add column if not exists moneda_facturada text;

comment on column ordenes.moneda_facturada is
  'Con qué moneda pagó el cliente una comanda facturada aparte: BS, USD o '
  'MIXTO (parte y parte). Solo aplica cuando facturada_aparte es verdadero.';

-- Los valores admitidos, y que solo tenga sentido donde lo tiene: una orden que
-- se cobró por esta caja ya dice su moneda por sus propios pagos.
alter table ordenes drop constraint if exists moneda_facturada_valida;
alter table ordenes add constraint moneda_facturada_valida
  check (
    (moneda_facturada is null or moneda_facturada in ('BS', 'USD', 'MIXTO'))
    and (facturada_aparte or moneda_facturada is null)
  );

-- Se deja nula a propósito en vez de exigirla: las comandas que ya están
-- cargadas no tienen cómo saberlo, y bloquearlas dejaría la jornada trancada.
-- El formulario sí la pide de aquí en adelante, y los reportes muestran las
-- viejas como «sin especificar» para que se puedan completar desde Editar.

-- ---------------------------------------------------------------------------
-- La vista la trae
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
  o.moneda_facturada,
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
