-- ============================================================================
-- Migración 0007: el repartidor se asigna después de cargar la orden
--
-- La 0006 exigía el repartidor al crear la orden, y en la práctica no se puede:
-- cuando la cajera está armando la comanda, con el cliente en línea, todavía no
-- se sabe quién la va a llevar. La restricción trancaba la carga.
--
-- Se quita la exigencia de la base. Que ninguna carrera se quede sin asignar se
-- sigue garantizando, pero en el momento correcto: el sistema no deja cerrar la
-- jornada mientras quede alguna orden sin repartidor, y la pantalla de Órdenes
-- del día muestra cuántas faltan para que no se olviden.
-- ============================================================================

alter table ordenes drop constraint if exists repartidor_obligatorio;

comment on column ordenes.repartidor_id is
  'Quién lleva la orden. Se asigna después de cargarla, cuando se sabe. '
  'Obligatorio antes de cerrar la jornada: sin él, la carrera no se le paga a nadie.';
