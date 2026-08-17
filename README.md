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
  sola), repartidor y uno o varios pagos con su captura adjunta. La **dirección
  es opcional** — muchos clientes mandan el location por WhatsApp y no escriben
  nada; lo que define el cobro es la zona.
- **El repartidor se asigna después**, porque al armar la comanda todavía no se
  sabe quién la va a llevar. Se pueden asignar **varias de una vez** cuando el
  motorizado sale con tres, y el sistema no deja cerrar la jornada mientras
  quede alguna sin asignar.
- **Pick Up**: el cliente pide por teléfono y pasa a buscarlo. Sin zona, sin tarifa de delivery y sin repartidor; se paga en
  efectivo en dólares o por pago móvil. **Entran en el cierre de caja** —la plata
  la recibe la misma cajera— pero **no cuentan como delivery**: no aparecen en la
  liquidación de repartidores ni en el desglose por zona.
- **Búsqueda de zona por nombre**: el cuadro tiene 104 zonas, así que en vez de
  un desplegable interminable se teclea parte del nombre. Ignora tildes y
  mayúsculas — "penon" encuentra "Peñón".
- **Avisa mientras se teclea**, no al día siguiente:
  - referencia ya cargada antes (la captura reenviada dos veces),
  - número de factura repetido,
  - lo pagado no cuadra con el total,
  - faltan números en el correlativo de facturas del día.
- **Pagos partidos**: cuando el cliente manda una parte por pago móvil y trae el
  resto en dólares, la app detecta lo que falta y ofrece agregarlo con el monto
  y la forma ya propuestos. Cada orden guarda sus pagos por separado, así que el
  cierre y la liquidación saben con qué plata entró cada carrera.
- **Editar una orden ya cargada**: número de factura, cliente, zona, montos,
  repartidor y pagos. Usa el mismo formulario que la pantalla de carga, así que
  las reglas son idénticas — cambiar la zona recalcula la tarifa sola. Una orden
  ya verificada solo la modifica la administradora.
- **Registra en cuál de nuestras cuentas cayó cada pago** (la columna «BANCO»
  del papel), que es el dato que dice en qué banco meterse a confirmarlo.
- **Verificación**: la administradora ve la captura del pago al lado de lo que
  se tecleó y aprueba con un botón. Ya no coteja contra papel impreso.
- **Cierre del día**: totales por forma de pago, delivery cobrado, total a pagar
  a repartidores y margen. Al cerrar, la jornada queda congelada.
- **Liquidación de repartidores**: cuántas carreras hizo cada uno y cuánto se le
  debe, por día o por rango de fechas.
- **Dos reportes de Excel distintos**, porque responden preguntas distintas:
  - **Cierre** — cómo cerró el día: totales en dólares y bolívares, desglose por
    forma de pago y por zona, y una lista de lo que quedó por revisar. El
    detalle de las órdenes va en su propia hoja.
  - **Liquidación** — a quién pagarle cuánto: agrupada por repartidor, con sus
    carreras listadas debajo y el subtotal de cada uno, más una hoja de resumen
    de una línea por persona.

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
| **CARRERA** | Lo que el cliente paga por el delivery. Sale solo al elegir la zona |
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

**Nadie se registra solo.** Los usuarios los crea el administrador desde
Configuración → Usuarios, con un nombre de usuario y una clave. La cajera y los
repartidores **no necesitan tener correo**: entran con algo como `genesis` y su
clave.

Por debajo Supabase sigue guardando un correo, porque su sistema de
autenticación lo necesita, así que la app le pega un dominio interno
(`genesis@broaster.local`) que nunca recibe nada. Quien sí tenga correo real
—el dueño— puede entrar con él igual.

La única excepción es el arranque: el primer usuario que entra al sistema queda
como administrador activo, porque no hay todavía nadie que pueda darle acceso.

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
   - `0004_primer_usuario_admin.sql` — hace que el primer usuario que se
     registre quede como administrador
   - `0005_usuarios_sin_correo.sql` — permite entrar con nombre de usuario
   - `0006_direccion_opcional_repartidor_obligatorio.sql` — la dirección deja de
     ser obligatoria
   - `0007_repartidor_se_asigna_despues.sql` — el repartidor se asigna después
     de cargar la orden
   - `0008_pickup.sql` — pedidos que el cliente pasa a buscar (pick up)
   - `0009_renombrar_pick_up.sql` — solo hace falta si se ejecutó la `0008`
     antes del cambio de nombre
   - `0010_monedas_y_factura_anulada.sql` — separa lo cobrado en cada moneda y
     libera el número de factura de las órdenes anuladas

> En **Authentication → Providers → Email**, desactivar **"Confirm email"**. Los
> usuarios sin correo real usan direcciones internas que no reciben nada, así
> que con la confirmación activada no podrían entrar nunca.

> **Antes de ejecutar `0003`**, reemplazar los repartidores de ejemplo por los
> reales, o cargarlos después desde Configuración.
>
> Ese archivo carga `pago_repartidor_usd` igual a la tarifa del cliente porque
> al repartidor se le paga el delivery completo. Es el acuerdo real, no un valor
> provisional.

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

La app no tiene registro público, así que el primer usuario se crea desde
Supabase: **Authentication → Users → Add user**, con el correo y la clave del
dueño. Queda como administrador activo automáticamente, porque no hay todavía
nadie que pueda darle acceso.

De ahí en adelante todo se hace desde la app: el administrador crea a la cajera
y a los demás desde **Configuración → Usuarios**, con nombre de usuario y clave,
sin necesidad de correo.

> **Si un usuario se registró pero no aparece en Configuración**, casi siempre es
> porque se borró su fila de la tabla `usuarios`. El usuario de autenticación
> sigue vivo, y como esa fila solo se crea al registrarse, volver a registrarse
> con el mismo correo ya no la recrea. Se arregla ejecutando
> `supabase/utilidades/reparar_usuario.sql` en el SQL Editor.
>
> Para borrar un usuario de verdad, hacerlo desde **Authentication → Users**, no
> desde la tabla `usuarios`: así se borra todo junto y al registrarse de nuevo
> se recrea solo.

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
- **Cada zona guarda dos tarifas aunque hoy sean iguales.** Al repartidor se le
  paga el delivery completo, así que el margen del local es cero. Las dos
  columnas se mantienen para que cambiar el acuerdo sea cuestión de editar
  números, no de tocar el modelo. Mientras no haya diferencia, la app **oculta
  sola** las columnas de margen en la liquidación y en el cierre, y las vuelve a
  mostrar en cuanto alguna zona deje diferencia.

---

## Antes de entregárselo a las cajeras

1. Correr `supabase/utilidades/limpiar_pruebas.sql` en el SQL Editor. Borra las
   órdenes, pagos, cierres y tasas de prueba, y conserva las 104 zonas con sus
   tarifas, los bancos, las cuentas del local y los usuarios.
2. Borrar las capturas de prueba desde **Storage → capturas**.
3. Cargar los **repartidores reales** en Configuración.
4. Crear el usuario de cada cajera en Configuración → Usuarios, y anotar su
   clave para entregársela.
5. **Probar una orden real completa con captura adjunta**, y verificarla. Es lo
   único que comprueba de punta a punta que la subida de imágenes funciona
   contra el Supabase de producción.
6. Pasarles [GUIA-CAJERA.md](GUIA-CAJERA.md) — cabe en una hoja.

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

- **Las abreviaturas de las cuentas.** Se cargaron `BP` = Banco Plaza y
  `BB` = Bicentenario a partir de la hoja; confirmar que son esas.
- La lista de **repartidores** (nombre y teléfono).
- Confirmar la **hora de corte** de la jornada (por defecto, 5 a.m.).
- Si la **tasa** que se usa es la del BCV o una propia del local, y quién la
  carga cada día.

Los nombres de zona que se leían con menos claridad en la foto del cuadro ya
están confirmados y cargados tal cual: **Loblán**, **Mercedores**, **Cutira**,
**La Silsa**, **Cochecito**, **Monte Cristo** y **Av. Roosvelt** (escrito así en
el papel, no «Roosevelt»).

## Ideas para más adelante

- **OCR de la captura**: que la app lea referencia, monto y banco de la imagen y
  la cajera solo confirme. Para esto hacen falta capturas reales de ejemplo de
  cada banco, porque el formato varía mucho.
- **WhatsApp**: recibir el pedido y la captura automáticamente. Depende de la
  API de WhatsApp Business (tiene costo y requiere verificación de la empresa).
- **Reportes acumulados** para el dueño: ventas por zona, márgenes del delivery,
  evolución mes a mes.
