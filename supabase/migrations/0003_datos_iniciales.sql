-- ============================================================================
-- Migración 0003: datos iniciales
--
-- Bancos: la lista real del sistema venezolano, sirve tal cual.
-- Zonas:  el cuadro real de deliverys del local (104 zonas, de $2 a $7).
--
-- PAGO AL REPARTIDOR
--
-- Al repartidor se le paga el delivery completo: exactamente lo que pagó el
-- cliente por esa zona. Por eso `pago_repartidor_usd` = `tarifa_cliente_usd` y
-- el margen del local es cero. No es un valor provisional, es el acuerdo real.
--
-- La estructura de dos columnas se mantiene igual, para que el día que se
-- decida dejar un margen baste con cambiar los números (desde Configuración ->
-- Zonas, o con una de las consultas del final de este archivo) sin tocar nada
-- más. Mientras sean iguales, la app oculta sola las columnas de margen.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Bancos
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
-- Cuentas propias del local — dónde cae la plata
--
-- Son la columna "BANCO" de la hoja de papel. Se cargan las dos que aparecen
-- en la hoja (BP y BB); si el local recibe en más cuentas, se agregan desde
-- Configuración.
--
-- ⚠ CONFIRMAR a qué banco corresponde cada abreviatura, y cargar el teléfono
--   de pago móvil y los últimos dígitos de cada cuenta.
-- ---------------------------------------------------------------------------

insert into cuentas (nombre, abreviatura, banco_id, orden)
select c.nombre, c.abreviatura, b.id, c.orden
from (values
  ('Banco Plaza',  'BP', 'Banco Plaza',  1),
  ('Bicentenario', 'BB', 'Bicentenario', 2)
) as c(nombre, abreviatura, banco, orden)
left join bancos b on b.nombre = c.banco
on conflict (abreviatura) do nothing;

-- ---------------------------------------------------------------------------
-- Zonas de delivery
--
-- `orden` agrupa por precio igual que el cuadro en papel (20 = $2, 30 = $3…),
-- y dentro de cada grupo la app las muestra alfabéticamente.
--
-- El `precio, precio` del SELECT no es un descuido: la primera copia es lo que
-- se le cobra al cliente y la segunda lo que se le paga al repartidor, y hoy
-- son el mismo monto. Ver la nota de arriba.
-- ---------------------------------------------------------------------------

insert into zonas (nombre, tarifa_cliente_usd, pago_repartidor_usd, orden)
select nombre, precio, precio, orden
from (values
  -- $2,00
  ('Panteón',            2.00, 20),
  ('Lecuna',             2.00, 20),
  ('Urdaneta',           2.00, 20),
  ('Av. Universidad',    2.00, 20),
  ('Bellas Artes',       2.00, 20),
  ('San Bernardino',     2.00, 20),
  ('Nuevo Circo',        2.00, 20),
  ('San Agustín',        2.00, 20),
  ('La Hoyada',          2.00, 20),

  -- $3,00
  ('Baralt',             3.00, 30),
  ('Qta. Crespo',        3.00, 30),
  ('La Pastora',         3.00, 30),
  ('Puente Medina',      3.00, 30),
  ('La Charneca',        3.00, 30),
  ('Cotiza',             3.00, 30),
  ('Altagracia',         3.00, 30),
  ('Loblán',             3.00, 30),
  ('Pinto Salinas',      3.00, 30),
  ('Maripérez',          3.00, 30),
  ('La Florida',         3.00, 30),
  ('Libertador',         3.00, 30),
  ('Andrés Bello',       3.00, 30),
  ('Caño Amarillo',      3.00, 30),
  ('Av. Sucre',          3.00, 30),
  ('Av. San Martín',     3.00, 30),
  ('Boyacá',             3.00, 30),
  ('El Paraíso',         3.00, 30),
  ('Av. Casanova',       3.00, 30),
  ('Sabana Grande',      3.00, 30),
  ('Plaza Venezuela',    3.00, 30),
  ('Bello Monte',        3.00, 30),
  ('Helicoide',          3.00, 30),

  -- $4,00
  ('El Bosque',          4.00, 40),
  ('Lídice',             4.00, 40),
  ('Mercedores',         4.00, 40),
  ('Catia',              4.00, 40),
  ('Los Robles',         4.00, 40),
  ('23 de Enero',        4.00, 40),
  ('Alta Vista',         4.00, 40),
  ('Cutira',             4.00, 40),
  ('Polvorín',           4.00, 40),
  ('Cota 905',           4.00, 40),
  ('La Ceiba',           4.00, 40),
  ('Alta Florida',       4.00, 40),
  ('Chapellín',          4.00, 40),
  ('Chacao',             4.00, 40),
  ('La Castellana',      4.00, 40),
  ('Altamira',           4.00, 40),
  ('Los Palos Grandes',  4.00, 40),
  ('Santa María',        4.00, 40),
  ('Montalbán',          4.00, 40),
  ('Los Dos Caminos',    4.00, 40),
  ('Monte Cristo',       4.00, 40),
  ('La Carlota',         4.00, 40),
  ('Chaguaramos',        4.00, 40),
  ('Las Mercedes',       4.00, 40),
  ('El Valle',           4.00, 40),
  ('La Yaguara',         4.00, 40),
  ('El Cementerio',      4.00, 40),
  ('Av. Roosvelt',       4.00, 40),
  ('La Bandera',         4.00, 40),
  ('Fuerte Tiuna',       4.00, 40),
  ('San Martín',         4.00, 40),
  ('Los Naranjos',       4.00, 40),

  -- $5,00
  ('Sebucán',            5.00, 50),
  ('Artigas',            5.00, 50),
  ('Pérez Bonalde',      5.00, 50),
  ('La Urbina',          5.00, 50),
  ('Boleíta',            5.00, 50),
  ('Los Ruices',         5.00, 50),
  ('El Márquez',         5.00, 50),
  ('La California',      5.00, 50),
  ('Prados del Este',    5.00, 50),
  ('Santa Fe',           5.00, 50),
  ('Valle Arriba',       5.00, 50),
  ('La Alameda',         5.00, 50),
  ('Petare',             5.00, 50),
  ('La Vega',            5.00, 50),
  ('Carapita',           5.00, 50),
  ('Antímano',           5.00, 50),
  ('El Cafetal',         5.00, 50),
  ('Santa Inés',         5.00, 50),
  ('Peñón',              5.00, 50),
  ('Cochecito',          5.00, 50),
  ('La Silsa',           5.00, 50),
  ('Vista Alegre',       5.00, 50),
  ('Santa Paula',        5.00, 50),
  ('Mamera',             5.00, 50),

  -- $6,00
  ('La Rinconada',       6.00, 60),
  ('Ruiz Pineda',        6.00, 60),
  ('Caricuao',           6.00, 60),
  ('Piedra Azul',        6.00, 60),
  ('Las Mayas',          6.00, 60),
  ('Trinidad',           6.00, 60),
  ('La Tahona',          6.00, 60),
  ('El Hatillo',         6.00, 60),
  ('Macaracuay',         6.00, 60),
  ('Palo Verde',         6.00, 60),
  ('La Bonita',          6.00, 60),
  ('Propatria',          6.00, 60),
  ('Casalta',            6.00, 60),
  ('Cruz del Este',      6.00, 60),

  -- $7,00
  ('Punto Fijo',         7.00, 70),
  ('Alto Hatillo',       7.00, 70)
) as cuadro(nombre, precio, orden)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- Repartidores — EJEMPLO, reemplazar por los reales
-- ---------------------------------------------------------------------------

insert into repartidores (nombre, telefono) values
  ('Repartidor 1', null),
  ('Repartidor 2', null)
on conflict do nothing;

-- ============================================================================
-- Si algún día se decide dejarle margen al local, correr UNA de estas.
-- (Están comentadas a propósito: hay que elegir y descomentar.)
-- ============================================================================

-- Opción A — se le paga $1 menos que lo que paga el cliente en cada zona,
-- sin bajar de $1:
-- update zonas set pago_repartidor_usd = greatest(tarifa_cliente_usd - 1, 1);

-- Opción B — se le paga un porcentaje de lo cobrado (aquí, 70%):
-- update zonas set pago_repartidor_usd = round(tarifa_cliente_usd * 0.70, 2);

-- Opción C — monto fijo por carrera, sin importar la zona (aquí, $2):
-- update zonas set pago_repartidor_usd = 2.00;

-- Opción D — tarifa distinta por banda de precio:
-- update zonas set pago_repartidor_usd = case tarifa_cliente_usd
--   when 2.00 then 1.50
--   when 3.00 then 2.00
--   when 4.00 then 3.00
--   when 5.00 then 4.00
--   when 6.00 then 5.00
--   when 7.00 then 6.00
-- end;
