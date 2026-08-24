-- Prueba funcional del esquema, antes de montarlo en Supabase.
-- Cada bloque debe imprimir OK; si algo falla, la migración aborta.

\set ON_ERROR_STOP on

-- Un usuario y un repartidor para poder crear órdenes.
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'cajera@local');
update usuarios set activo = true, rol = 'admin' where id = '11111111-1111-1111-1111-111111111111';
insert into repartidores (id, nombre)
values ('22222222-2222-2222-2222-222222222222', 'Repartidor de prueba');

create or replace function crear_orden(factura text, zona text, pedido numeric) returns uuid
language plpgsql as $$
declare nueva uuid; z record;
begin
  select * into z from zonas where nombre = zona;
  insert into ordenes (fecha_operativa, numero_factura, cliente_nombre, direccion, zona_id,
    repartidor_id, tarifa_cliente_usd, pago_repartidor_usd, monto_pedido_usd, tasa_bs_por_usd, creada_por)
  values ('2026-08-12', factura, 'Cliente', 'Una dirección', z.id,
    '22222222-2222-2222-2222-222222222222',
    z.tarifa_cliente_usd, z.pago_repartidor_usd, pedido, 764.36,
    '11111111-1111-1111-1111-111111111111')
  returning id into nueva;
  return nueva;
end $$;

-- ---------------------------------------------------------------------------
\echo '1. La tarifa de la zona entra en la orden'
-- ---------------------------------------------------------------------------
-- El insert va en su propia sentencia: llamarlo dentro de un WHERE sobre una
-- tabla vacía no lo ejecutaría nunca.
select crear_orden('45361', 'Urdaneta', 30) \gset

select case when tarifa_cliente_usd = 2.00 then 'OK' else 'FALLA: '||tarifa_cliente_usd end as resultado
from ordenes where numero_factura = '45361';

-- ---------------------------------------------------------------------------
\echo '2. La factura repetida en el mismo día se rechaza'
-- ---------------------------------------------------------------------------
do $$
begin
  perform crear_orden('45361', 'Urdaneta', 10);
  raise exception 'FALLA: aceptó una factura repetida';
exception when unique_violation then
  raise notice 'OK';
end $$;

-- ---------------------------------------------------------------------------
\echo '3. Un pago móvil sin cuenta receptora se rechaza'
-- ---------------------------------------------------------------------------
do $$
declare o uuid;
begin
  select id into o from ordenes where numero_factura = '45361';
  insert into pagos (orden_id, metodo, referencia, monto, moneda)
  values (o, 'pago_movil', '9319', 100, 'BS');
  raise exception 'FALLA: aceptó un pago móvil sin cuenta';
exception when check_violation then
  raise notice 'OK';
end $$;

-- ---------------------------------------------------------------------------
\echo '4. El efectivo no necesita referencia'
-- ---------------------------------------------------------------------------
do $$
declare o uuid;
begin
  select id into o from ordenes where numero_factura = '45361';
  insert into pagos (orden_id, metodo, monto, moneda) values (o, 'efectivo_usd', 5, 'USD');
  raise notice 'OK';
end $$;

-- ---------------------------------------------------------------------------
\echo '5. Dos referencias CORTAS iguales conviven (con 4 dígitos chocan solas)'
-- ---------------------------------------------------------------------------
do $$
declare o1 uuid; o2 uuid; c uuid;
begin
  select id into c from cuentas where abreviatura = 'BP';
  o1 := crear_orden('45362', 'Chacao', 20);
  o2 := crear_orden('45363', 'Catia', 20);
  insert into pagos (orden_id, metodo, cuenta_id, referencia, monto, moneda)
    values (o1, 'pago_movil', c, '9319', 15000, 'BS');
  insert into pagos (orden_id, metodo, cuenta_id, referencia, monto, moneda)
    values (o2, 'pago_movil', c, '9319', 17000, 'BS');
  raise notice 'OK';
end $$;

-- ---------------------------------------------------------------------------
\echo '6. Dos referencias COMPLETAS iguales sí se rechazan'
-- ---------------------------------------------------------------------------
do $$
declare o uuid; c uuid;
begin
  select id into c from cuentas where abreviatura = 'BP';
  o := crear_orden('45364', 'Altamira', 20);
  insert into pagos (orden_id, metodo, cuenta_id, referencia, monto, moneda)
    values (o, 'pago_movil', c, '002134559319', 15000, 'BS');
  insert into pagos (orden_id, metodo, cuenta_id, referencia, monto, moneda)
    values (o, 'pago_movil', c, '002134559319', 15000, 'BS');
  raise exception 'FALLA: aceptó la misma referencia completa dos veces';
exception when unique_violation then
  raise notice 'OK';
end $$;

-- ---------------------------------------------------------------------------
\echo '7. La vista de detalle convierte los bolívares y detecta el descuadre'
-- ---------------------------------------------------------------------------
-- Chacao son $4: total 20 + 4 = 24. Pagó 15.000 Bs = $19,62. Faltan $4,38.
select case
  when round(pagado_usd, 2) = 19.62 and round(diferencia_usd, 2) = -4.38 then 'OK'
  else 'FALLA: pagado='||round(pagado_usd, 2)||' diferencia='||round(diferencia_usd, 2)
end as resultado
from v_ordenes_detalle where numero_factura = '45362';

-- ---------------------------------------------------------------------------
\echo '8. La liquidación agrupa las carreras por repartidor'
-- ---------------------------------------------------------------------------
-- Quedan 3 órdenes vivas: Urdaneta 2 + Chacao 4 + Catia 4 = 10.
--
-- La cuarta (bloque 6) no cuenta: al capturarse la excepción, PL/pgSQL revierte
-- todo lo hecho dentro de ese bloque, incluida la orden que lo abría.
select case when carreras = 3 and total_pagar_usd = 10.00 then 'OK'
  else 'FALLA: carreras='||carreras||' pagar='||total_pagar_usd end as resultado
from v_liquidacion_repartidores where repartidor = 'Repartidor de prueba';

-- ---------------------------------------------------------------------------
\echo '8b. Se acepta sin dirección y sin repartidor: eso se asigna después'
-- ---------------------------------------------------------------------------
insert into ordenes (fecha_operativa, numero_factura, cliente_nombre, zona_id,
  tarifa_cliente_usd, pago_repartidor_usd, monto_pedido_usd, tasa_bs_por_usd, creada_por)
select '2026-08-12', '45390', 'Mandó el location', id,
  tarifa_cliente_usd, pago_repartidor_usd, 10, 764.36, '11111111-1111-1111-1111-111111111111'
from zonas where nombre = 'Chacao';

select case when direccion is null and repartidor_id is null then 'OK' else 'FALLA' end as resultado
from ordenes where numero_factura = '45390';

-- ---------------------------------------------------------------------------
\echo '8c. Un pick up no lleva zona, ni tarifa, ni repartidor'
-- ---------------------------------------------------------------------------
insert into ordenes (fecha_operativa, numero_factura, tipo, cliente_nombre,
  tarifa_cliente_usd, pago_repartidor_usd, monto_pedido_usd, tasa_bs_por_usd, creada_por)
values ('2026-08-12', '45392', 'pickup', 'Pasa a buscarlo',
  0, 0, 15, 764.36, '11111111-1111-1111-1111-111111111111');

select case when zona = 'Pick Up' and total_usd = 15 then 'OK'
  else 'FALLA: zona='||zona||' total='||total_usd end as resultado
from v_ordenes_detalle where numero_factura = '45392';

-- ---------------------------------------------------------------------------
\echo '8d. Un retiro con tarifa de delivery se rechaza'
-- ---------------------------------------------------------------------------
do $$
begin
  insert into ordenes (fecha_operativa, numero_factura, tipo, cliente_nombre, zona_id,
    tarifa_cliente_usd, pago_repartidor_usd, monto_pedido_usd, tasa_bs_por_usd, creada_por)
  select '2026-08-12', '45393', 'pickup', 'Cliente', id,
    4, 4, 15, 764.36, '11111111-1111-1111-1111-111111111111'
  from zonas where nombre = 'Chacao';
  raise exception 'FALLA: un pick up aceptó zona y tarifa de delivery';
exception when check_violation then
  raise notice 'OK';
end $$;

-- ---------------------------------------------------------------------------
\echo '8e. El retiro no entra en la liquidación de nadie'
-- ---------------------------------------------------------------------------
select case when coalesce(sum(carreras), 0) = 3 then 'OK'
  else 'FALLA: el retiro se coló, carreras='||sum(carreras) end as resultado
from v_liquidacion_repartidores;

-- ---------------------------------------------------------------------------
\echo '8f. Una comanda facturada aparte no lleva pagos pero sí carrera'
-- ---------------------------------------------------------------------------
insert into ordenes (fecha_operativa, numero_factura, cliente_nombre, zona_id,
  tarifa_cliente_usd, pago_repartidor_usd, repartidor_id, monto_pedido_usd,
  tasa_bs_por_usd, creada_por, facturada_aparte)
select '2026-08-12', 'F-0001', 'Empresa con factura fiscal', z.id,
  4, 4, r.id, 90, 764.36, '11111111-1111-1111-1111-111111111111', true
from zonas z, repartidores r
where z.nombre = 'Chacao'
limit 1;

select case
  when facturada_aparte and pagado_usd = 0 and referencias is null then 'OK'
  else 'FALLA: facturada='||facturada_aparte||' pagado='||pagado_usd
end as resultado
from v_ordenes_detalle where numero_factura = 'F-0001';

-- ---------------------------------------------------------------------------
\echo '8g. Un pick up no se puede marcar como facturado aparte'
-- ---------------------------------------------------------------------------
do $$
begin
  insert into ordenes (fecha_operativa, numero_factura, tipo, cliente_nombre,
    tarifa_cliente_usd, pago_repartidor_usd, monto_pedido_usd, tasa_bs_por_usd,
    creada_por, facturada_aparte)
  values ('2026-08-12', 'F-0002', 'pickup', 'Cliente', 0, 0, 15, 764.36,
    '11111111-1111-1111-1111-111111111111', true);
  raise exception 'FALLA: dejó marcar un pick up como facturado aparte';
exception when check_violation then
  raise notice 'OK';
end $$;

-- ---------------------------------------------------------------------------
\echo '8g bis. Su carrera sí se le paga al repartidor que la llevó'
-- ---------------------------------------------------------------------------
-- Es lo único que la comanda facturada aparte aporta: eran 3 carreras y con
-- ella son 4. Su plata no entra en la caja, pero al repartidor se le paga.
select case when coalesce(sum(carreras), 0) = 4 then 'OK'
  else 'FALLA: la carrera facturada aparte no se liquidó, carreras='||sum(carreras) end as resultado
from v_liquidacion_repartidores;

-- ---------------------------------------------------------------------------
\echo '8h. La vista junta las referencias de la orden al lado de la factura'
-- ---------------------------------------------------------------------------
-- La 45362 se pagó por pago móvil y tiene referencia; la 45361 fue en efectivo
-- y no tiene ninguna, que es justo lo que debe pasar.
select case
  when (select referencias from v_ordenes_detalle where numero_factura = '45362') is not null
   and (select referencias from v_ordenes_detalle where numero_factura = '45361') is null
  then 'OK'
  else 'FALLA: las referencias no salieron como se esperaba' end as resultado;

-- ---------------------------------------------------------------------------
\echo '9. Con el día cerrado ya nadie puede tocar las órdenes'
-- ---------------------------------------------------------------------------
insert into cierres (fecha_operativa, cerrado_por)
values ('2026-08-12', '11111111-1111-1111-1111-111111111111');

do $$
begin
  update ordenes set monto_pedido_usd = 999 where numero_factura = '45361';
  raise exception 'FALLA: dejó modificar una orden de un día cerrado';
exception when check_violation then
  raise notice 'OK';
end $$;

-- ---------------------------------------------------------------------------
\echo '10. La auditoría guardó quién hizo cada cosa'
-- ---------------------------------------------------------------------------
select case when count(*) >= 4 then 'OK' else 'FALLA: solo '||count(*)||' registros' end as resultado
from auditoria where tabla = 'ordenes';
