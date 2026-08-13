-- ============================================================================
-- Borrar todo lo cargado durante las pruebas
--
-- Se ejecuta UNA vez, justo antes de entregarle el sistema a las cajeras.
-- Deja la base limpia pero conserva lo que sí sirve: las 104 zonas con sus
-- tarifas, los bancos, las cuentas del local y los usuarios ya creados.
--
-- Ejecutar en Supabase: SQL Editor -> pegar -> Run.
--
-- ⚠ ESTO NO SE PUEDE DESHACER. Si hay alguna orden real que quieras conservar,
--   bájala antes en Excel desde la pantalla de Cierre.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PASO 1 — Ver qué se va a borrar, antes de borrarlo
-- ---------------------------------------------------------------------------

select 'órdenes' as que, count(*) as cuantas from ordenes
union all select 'pagos', count(*) from pagos
union all select 'cierres', count(*) from cierres
union all select 'tasas cargadas', count(*) from tasas_cambio
union all select 'repartidores de ejemplo', count(*) from repartidores
  where nombre in ('Repartidor 1', 'Repartidor 2');

-- ---------------------------------------------------------------------------
-- PASO 2 — Borrar
--
-- El orden importa: primero lo que depende de otra cosa. Los cierres van de
-- primeros porque congelan el día y no dejarían borrar sus órdenes.
-- ---------------------------------------------------------------------------

delete from cierres;
delete from pagos;
delete from ordenes;

-- Las tasas se borran también: la del primer día real se carga al abrir.
delete from tasas_cambio;

-- Los repartidores de ejemplo que trajo la instalación. Solo se van si nadie
-- les asignó nada; si alguno resultó ser un repartidor real al que le
-- cambiaste el nombre, no coincide y se queda.
delete from repartidores where nombre in ('Repartidor 1', 'Repartidor 2');

-- La auditoría de las pruebas tampoco hace falta.
delete from auditoria;

-- ---------------------------------------------------------------------------
-- PASO 3 — Confirmar que quedó limpio y que lo importante sigue ahí
-- ---------------------------------------------------------------------------

select 'órdenes (debe ser 0)' as que, count(*) as cuantas from ordenes
union all select 'pagos (debe ser 0)', count(*) from pagos
union all select 'cierres (debe ser 0)', count(*) from cierres
union all select 'zonas (deben ser 104)', count(*) from zonas
union all select 'bancos (deben ser 20)', count(*) from bancos
union all select 'cuentas del local', count(*) from cuentas
union all select 'repartidores reales', count(*) from repartidores
union all select 'usuarios', count(*) from usuarios;

-- ============================================================================
-- Las capturas de pago de las pruebas quedan en Storage. Se borran desde
-- Storage -> capturas, entrando a la carpeta del día de prueba. No estorban
-- ni ocupan casi nada, pero conviene dejarlo limpio.
-- ============================================================================
