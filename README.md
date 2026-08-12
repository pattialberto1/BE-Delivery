# Broaster Express La Candelaria — Sistema de Delivery

App web para registrar los pagos y los deliverys de la jornada, verificarlos y
liquidar a los repartidores.

## El problema que resuelve

Hoy el mismo dato se escribe tres veces:

1. La cajera lo anota a mano en una hoja cuando confirma el pago móvil.
2. Alguien lo pasa a un Excel en la computadora y lo imprime.
3. La administradora coteja comanda por comanda que factura, referencia y cuenta
   coincidan, y después arma **otro** cuadro a mano con las carreras de cada
   repartidor.

Con esta app el dato se teclea **una sola vez**, en la tablet, en el momento en
que se confirma el pago. De ahí sale todo lo demás solo: la tarifa según la
zona, el cuadre del día, la verificación y la liquidación de repartidores.

## Qué hace

- **Alta de orden** desde la tablet: factura, cliente, zona (la tarifa aparece
  sola), repartidor y uno o varios pagos con su captura adjunta.
- **Búsqueda de zona por nombre**: el cuadro tiene 104 zonas, así que en vez de
  un desplegable interminable se teclea parte del nombre. Ignora tildes y
  mayúsculas — "penon" encuentra "Peñón".
- **Avisa mientras se teclea**, no al día siguiente:
  - referencia ya cargada antes (la captura reenviada dos veces),
  - número de factura repetido,
  - lo pagado no cuadra con el total,
  - faltan números en el correlativo de facturas del día.
- **Registra en cuál de nuestras cuentas cayó cada pago** (la columna «BANCO»
  del papel), que es el dato que dice en qué banco meterse a confirmarlo.
- **Verificación**: la administradora ve la captura del pago al lado de lo que
  se tecleó y aprueba con un botón. Ya no coteja contra papel impreso.
- **Cierre del día**: totales por forma de pago, delivery cobrado, total a pagar
  a repartidores y margen. Al cerrar, la jornada queda congelada.
- **Liquidación de repartidores**: cuántas carreras hizo cada uno y cuánto se le
  debe, por día o por rango de fechas.
- **Exporte a Excel** con dos hojas (detalle y liquidación) y vista imprimible.

## De la hoja de papel a la app

La hoja que hoy se llena a mano tiene ocho columnas. Así queda cada una:

| Columna del papel | En la app |
|---|---|
| **N.** | Ya no hace falta: la app numera sola |
| **N. FACTURA** | Se teclea. La app avisa si está repetida o si falta alguna en el correlativo |
| **TOTAL** | Sale solo: pedido + delivery |
| **DIVISA** | Un pago con forma «Efectivo $» o «Zelle» |
| **P. MOVIL** | Un pago con forma «Pago móvil», en Bs |
| **REF.** | Se teclea, completa o los últimos 4 dígitos. La app cruza las dos formas |
| **CARRERA** | Sale solo al elegir la zona |
| **BANCO** | «Entró en»: cuál de nuestras cuentas recibió el pago (BP, BB…) |

Lo que la hoja **no** tiene y la app agrega: la captura del pago pegada a la
orden, el repartidor asignado, la dirección, y el cuadre automático entre lo
pagado y el total.

## Roles

| Rol | Qué puede hacer |
|---|---|
| **Cajera** | Cargar órdenes y corregir las que aún no están verificadas |
| **Administradora** | Todo: verificar, cerrar la jornada, configurar zonas, tarifas y usuarios |
| **Dueño** | Solo lectura de reportes y liquidaciones |

Quien se registra entra **desactivado**. Un administrador tiene que activarlo
desde Configuración → Usuarios. Así, que alguien consiga la dirección de la app
no le alcanza para ver los datos del negocio.

---

## Montaje

### 1. Crear el proyecto en Supabase

1. Entrar a [supabase.com](https://supabase.com) y crear un proyecto (el plan
   gratuito alcanza de sobra para este volumen).
2. Ir a **SQL Editor** y ejecutar, en orden, los archivos de
   `supabase/migrations/`:
   - `0001_esquema_inicial.sql` — tablas, reglas y permisos
   - `0002_storage_capturas.sql` — el depósito de las capturas de pago
   - `0003_datos_iniciales.sql` — bancos venezolanos y **el cuadro real de
     deliverys** (104 zonas, de $2 a $7)

> **Antes de ejecutar `0003`**, reemplazar los repartidores de ejemplo por los
> reales, o cargarlos después desde Configuración.
>
> ⚠ Ese archivo carga `pago_repartidor_usd` **igual** a la tarifa del cliente
> (margen cero), porque el cuadro en papel solo tiene lo que se le cobra al
> cliente. Ver [Lo que falta definir](#lo-que-falta-definir).

### 2. Configurar la app

```bash
cp .env.example .env
```

Llenar `.env` con los valores de **Project Settings → API** en Supabase:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_HORA_CORTE=5
```

`VITE_HORA_CORTE` define a partir de qué hora empieza la jornada nueva. Con `5`,
una orden facturada a la 1 a.m. cuenta para el día anterior — que es como
funciona el local en la práctica.

### 3. Correr

```bash
npm install
npm run dev
```

### 4. Crear el primer administrador

1. Entrar a la app y usar **"¿Usuario nuevo? Crear cuenta"**.
2. En Supabase, ir a **Table Editor → usuarios** y poner esa fila en
   `rol = admin` y `activo = true`.

Desde ahí, ese usuario puede activar a todos los demás desde la app.

### 5. Publicar (Vercel)

1. Conectar el repositorio en [vercel.com](https://vercel.com).
2. Cargar `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_HORA_CORTE` como
   variables de entorno del proyecto.
3. Desplegar. Cada push a la rama publica solo.

En la tablet, abrir la dirección en Chrome y usar **"Agregar a pantalla de
inicio"**: queda con su ícono, como una app normal.

---

## Comandos

```bash
npm run dev      # desarrollo
npm run build    # compilar para producción
npm test         # correr los tests
npm run lint     # revisar el código
npm run iconos   # regenerar los íconos de la PWA
```

---

## Cómo está armado

```
src/
  lib/reglas.ts       Reglas de negocio: validaciones, cuadre, correlativo,
                      día operativo. Funciones puras y con tests.
  lib/exportar.ts     Liquidación y generación del Excel.
  lib/supabase.ts     Cliente, subida de capturas, traducción de errores.
  contexto/Sesion.tsx Usuario, rol, catálogos y día operativo en curso.
  paginas/            Una pantalla por archivo.
supabase/migrations/  Esquema de la base de datos.
```

Tres decisiones que conviene conocer antes de tocar el código:

- **Las tarifas se copian dentro de cada orden**, no solo se referencian a la
  zona. Si mañana suben los precios, las órdenes viejas conservan lo que
  realmente se cobró y se pagó ese día, y los reportes históricos no se mueven.
- **Un recorte de referencia no se puede tratar como único.** En la hoja de
  papel se anotan solo los **últimos 4 dígitos** de la referencia completa,
  porque copiarla entera a mano es lento. La app acepta las dos formas y las
  cruza por sufijo, así que se puede seguir anotando el recorte de siempre.
  Pero con 4 dígitos hay 10.000 valores posibles: con el volumen de una semana,
  que dos pagos distintos terminen en los mismos números es esperable. Por eso
  la app **avisa** mostrando la factura y el monto en conflicto, pero deja
  guardar — trancar a la cajera con el cliente en línea sería peor que el
  problema que se quiere evitar. La base solo exige unicidad con la referencia
  completa (8 dígitos o más), donde una repetición sí delata la misma captura
  mandada dos veces. **Conviene teclear la referencia completa siempre que se
  pueda: es lo que convierte el aviso en certeza.**
- **`bancos` y `cuentas` son cosas distintas.** `cuentas` son las nuestras —
  dónde cae la plata, la columna «BANCO» del papel — y es obligatorio saberlo
  para poder ir a confirmar el pago. `bancos` es de dónde salió el pago del
  cliente, y es opcional.

---

## Puesta en marcha en el local

Conviene correr **una semana en paralelo** con el proceso de papel antes de
apagarlo: cargar el día completo en la app y comparar el cuadro de repartidores
que genera contra el que arma la administradora a mano. Deben dar idéntico.

Orden sugerido para no cambiarlo todo de golpe:

1. **Semana 1** — la cajera carga en la app *además* del papel. Se compara.
2. **Semana 2** — se apaga el papel y el paso de pasar a Excel. La
   administradora verifica desde la pantalla.
3. **Semana 3** — la liquidación sale de la app.

---

## Lo que falta definir

- **Cuánto se le paga al repartidor por cada zona.** Es lo único que bloquea la
  liquidación. El cuadro en papel solo tiene lo que se le cobra al cliente, así
  que por ahora la app carga las dos columnas iguales: margen cero, el local le
  pasa al repartidor el delivery completo. Se eligió ese valor porque nunca le
  paga de menos a nadie. El final de `0003_datos_iniciales.sql` trae cuatro
  consultas listas para los esquemas más comunes ($1 menos por zona, un
  porcentaje, un monto fijo, o una tarifa por banda de precio). También se puede
  ajustar zona por zona desde Configuración.
- **Qué son «Maxi Santiago» y la columna «CARRERA»** de la hoja: si ese nombre
  es el del repartidor y la hoja es una por repartidor, entonces el monto de
  CARRERA es lo que se le paga a él — y con eso queda resuelto el punto de
  arriba. También falta saber qué significa la «P» en vez de un monto.
- **Las abreviaturas de las cuentas.** Se cargaron `BP` = Banco Plaza y
  `BB` = Bicentenario a partir de la hoja; confirmar que son esas.
- La lista de **repartidores** (nombre y teléfono).
- Confirmar la **hora de corte** de la jornada (por defecto, 5 a.m.).
- Si la **tasa** que se usa es la del BCV o una propia del local, y quién la
  carga cada día.

Además, hay siete nombres del cuadro en papel que conviene confirmar porque no
se leían con total claridad en la foto: **Loblán**, **Mercedores**, **Cutira**,
**La Silsa**, **Cochecito**, **Monte Cristo** y **Av. Roosvelt** (escrito así en
el papel, no "Roosevelt"). Se cargaron tal como se leen; cualquier corrección se
hace desde Configuración.

## Ideas para más adelante

- **OCR de la captura**: que la app lea referencia, monto y banco de la imagen y
  la cajera solo confirme. Para esto hacen falta capturas reales de ejemplo de
  cada banco, porque el formato varía mucho.
- **WhatsApp**: recibir el pedido y la captura automáticamente. Depende de la
  API de WhatsApp Business (tiene costo y requiere verificación de la empresa).
- **Reportes acumulados** para el dueño: ventas por zona, márgenes del delivery,
  evolución mes a mes.
