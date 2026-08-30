-- ============================================================================
-- Migración 0013: cuánto se pagó en cada moneda cuando la facturada aparte
--                 se cobró parte y parte
--
-- La 0012 dejó dicho con qué moneda cobró la caja del local, pero «parte y
-- parte» sin montos no alcanza: para pagarle la carrera al repartidor hay que
-- saber cuánto entró en bolívares y cuánto en dólares.
--
-- Su dinero sigue sin sumar en ningún total de la caja del delivery. Esto es
-- solo el desglose de un cobro que ocurrió en la otra caja.
-- ============================================================================

alter table ordenes
  add column if not exists facturada_bs numeric(14, 2),
  add column if not exists facturada_divisa_usd numeric(12, 2);

comment on column ordenes.facturada_bs is
  'Bolívares que cobró la caja del local por una comanda facturada aparte '
  'pagada parte y parte. No suma en la caja del delivery.';
comment on column ordenes.facturada_divisa_usd is
  'Dólares que cobró la caja del local por una comanda facturada aparte '
  'pagada parte y parte. No suma en la caja del delivery.';

-- Nunca negativos, y solo donde tienen sentido: una orden cobrada por esta caja
-- ya dice sus montos por sus propios pagos.
alter table ordenes drop constraint if exists montos_facturada_validos;
alter table ordenes add constraint montos_facturada_validos
  check (
    coalesce(facturada_bs, 0) >= 0
    and coalesce(facturada_divisa_usd, 0) >= 0
    and (facturada_aparte or (facturada_bs is null and facturada_divisa_usd is null))
  );

-- Que una mixta traiga los dos montos se exige en el formulario, no acá: si
-- fuera una restricción de la base, las comandas mixtas que ya se hayan cargado
-- sin montos quedarían imposibles de tocar y trancarían la jornada. Los
-- reportes las muestran en rojo como «sin desglosar» para completarlas desde
-- Editar.

-- ---------------------------------------------------------------------------
-- La vista los trae
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
