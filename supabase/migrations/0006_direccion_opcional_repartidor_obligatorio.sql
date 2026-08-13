-- ============================================================================
-- Migración 0006: la dirección deja de ser obligatoria, el repartidor pasa a serlo
--
-- En la práctica muchos clientes mandan el location por WhatsApp y no escriben
-- ninguna dirección. Lo que define el cobro es la zona, y esa sigue siendo
-- obligatoria; la dirección pasa a ser un dato de apoyo.
--
-- Al revés con el repartidor: una carrera sin repartidor no se le paga a nadie
-- y deja el cuadro de liquidación incompleto, así que ahora se exige desde el
-- momento de cargar la orden.
-- ============================================================================

alter table ordenes alter column direccion drop not null;

comment on column ordenes.direccion is
  'Dirección o referencia de entrega. Opcional: muchos clientes mandan el location por WhatsApp.';

-- ---------------------------------------------------------------------------
-- Antes de exigir el repartidor, avisar si hay órdenes viejas sin asignar.
--
-- Se aborta con la lista de facturas en vez de fallar con un error de Postgres
-- sin contexto, para que se sepa exactamente qué hay que arreglar.
-- ---------------------------------------------------------------------------

do $$
declare
  pendientes text;
begin
  select string_agg(numero_factura, ', ' order by numero_factura)
  into pendientes
  from ordenes
  where repartidor_id is null and estado <> 'anulada';

  if pendientes is not null then
    raise exception
      'Hay órdenes sin repartidor asignado: %. Asígnalas desde Órdenes del día y vuelve a ejecutar esta migración.',
      pendientes;
  end if;
end $$;

-- Se usa un CHECK y no un NOT NULL para dejar fuera a las anuladas: una orden
-- que se canceló antes de salir del local puede no haber tenido repartidor
-- nunca, y obligarla a tener uno sería inventar un dato.
alter table ordenes add constraint repartidor_obligatorio
  check (estado = 'anulada' or repartidor_id is not null);
