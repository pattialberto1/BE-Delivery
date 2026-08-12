-- ============================================================================
-- Migración 0003: datos iniciales
--
-- Los bancos son la lista real del sistema venezolano y sirven tal cual.
--
-- Las ZONAS y los REPARTIDORES de abajo son EJEMPLOS para poder probar la app.
-- Reemplazarlos por el cuadro real desde Configuración -> Zonas, o editando
-- este archivo antes de ejecutarlo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Bancos (lista real — no hace falta tocarla)
-- ---------------------------------------------------------------------------

insert into bancos (nombre, codigo, orden) values
  ('Banesco', '0134', 1),
  ('Banco de Venezuela', '0102', 2),
  ('Mercantil', '0105', 3),
  ('Provincial (BBVA)', '0108', 4),
  ('Banco Nacional de Crédito (BNC)', '0191', 5),
  ('Bancaribe', '0114', 6),
  ('Banco del Tesoro', '0163', 7),
  ('Banco Exterior', '0115', 8),
  ('Bancamiga', '0172', 9),
  ('Banplus', '0174', 10),
  ('BFC Banco Fondo Común', '0151', 11),
  ('Banco Plaza', '0138', 12),
  ('Banco Activo', '0171', 13),
  ('Banco Caroní', '0128', 14),
  ('Banco Sofitasa', '0137', 15),
  ('100% Banco', '0156', 16),
  ('DelSur', '0157', 17),
  ('Mi Banco', '0169', 18),
  ('Banco Agrícola de Venezuela', '0166', 19),
  ('Bicentenario', '0175', 20)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- Zonas — EJEMPLO, reemplazar por el cuadro real
--
-- tarifa_cliente_usd  = lo que se le cobra al cliente
-- pago_repartidor_usd = lo que se le paga al repartidor por esa carrera
-- ---------------------------------------------------------------------------

insert into zonas (nombre, tarifa_cliente_usd, pago_repartidor_usd, orden) values
  ('La Candelaria', 1.50, 1.00, 1),
  ('Zona 2',        2.50, 1.75, 2),
  ('Zona 3',        3.50, 2.50, 3),
  ('Zona 4',        5.00, 3.50, 4)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- Repartidores — EJEMPLO, reemplazar por los reales
-- ---------------------------------------------------------------------------

insert into repartidores (nombre, telefono) values
  ('Repartidor 1', null),
  ('Repartidor 2', null)
on conflict do nothing;
