-- Prueba funcional del esquema, antes de montarlo en Supabase.
-- Cada bloque debe imprimir OK; si algo falla, la migración aborta.

\set ON_ERROR_STOP on

-- Un usuario para poder crear órdenes.
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'cajera@local');
update usuarios set activo = true, rol = 'admin' where id = '11111111-1111-1111-1111-111111111111';

create or replace function zona_de(nombre_zona text) returns uuid
language sql as $$ select id from zonas where nombre = nombre_zona $$;

create or replace function crear_orden(factura text, zona text, pedido numeric) returns uuid
language plpgsql as $$
declare nueva uuid; z record;
begin
  select * into z from zonas where nombre = zona;
  insert into ordenes (fecha_operativa, numero_factura, cliente_nombre, direccion, zona_id,
    tarifa_cliente_usd, pago_repartidor_usd, monto_pedido_usd, tasa_bs_por_usd, creada_por)
  values ('2026-08-12', factura, 'Cliente', 'Una dirección', z.id,
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
do $$
declare r uuid;
begin
  insert into repartidores (nombre) values ('Maxi') returning id into r;
  update ordenes set repartidor_id = r where numero_factura in ('45361', '45362');
end $$;

select case when carreras = 2 and total_pagar_usd = 6.00 then 'OK'
  else 'FALLA: carreras='||carreras||' pagar='||total_pagar_usd end as resultado
from v_liquidacion_repartidores where repartidor = 'Maxi';

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
