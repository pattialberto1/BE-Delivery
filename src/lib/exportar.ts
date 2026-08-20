import writeXlsxFile, { type Cell, type Row } from 'write-excel-file/browser'
import {
  ETIQUETA_ESTADO,
  ETIQUETA_METODO,
  ETIQUETA_TIPO,
  type LiquidacionRepartidor,
  type MetodoPago,
  type OrdenDetalle,
  type TotalesCierre,
} from './tipos'
import { detectarSaltosDeFactura, formatearFecha, monedaDeCobro, TOLERANCIA_DESCUADRE_USD } from './reglas'
import { ETIQUETA_MONEDA_COBRO } from './tipos'

/**
 * Cuenta las carreras por la moneda con la que se cobraron.
 *
 * Al repartidor se le paga con la plata que entró, así que hace falta saber
 * cuántas de sus carreras trajeron dólares y cuántas bolívares.
 */
export function carrerasPorMoneda(ordenes: OrdenDetalle[]) {
  const conteo = { USD: 0, BS: 0, MIXTO: 0, SIN_PAGO: 0 }
  for (const orden of ordenes) conteo[monedaDeCobro(orden)] += 1
  return conteo
}

/**
 * Suma cuánto hay que pagarle al repartidor por cada moneda de cobro.
 *
 * El pago al repartidor está tarifado en dólares, cobre lo que cobre el cliente,
 * así que las cuatro cifras salen en dólares: la pregunta que responde no es
 * «cuánto vale en Bs» sino «de este total, qué parte corresponde a carreras que
 * entraron en bolívares», que es lo que decide con qué plata se le paga.
 */
export function pagoPorMoneda(ordenes: OrdenDetalle[]) {
  const total = { USD: 0, BS: 0, MIXTO: 0, SIN_PAGO: 0 }
  for (const orden of ordenes) total[monedaDeCobro(orden)] += Number(orden.pago_repartidor_usd)
  return total
}

/** Resume el conteo en una línea legible, omitiendo lo que no ocurrió. */
export function resumenMonedas(ordenes: OrdenDetalle[]): string {
  const conteo = carrerasPorMoneda(ordenes)
  const partes = (Object.keys(conteo) as Array<keyof typeof conteo>)
    .filter((clave) => conteo[clave] > 0)
    .map((clave) => `${conteo[clave]} en ${ETIQUETA_MONEDA_COBRO[clave].toLowerCase()}`)
  return partes.join(' · ')
}

/**
 * Exportación a Excel.
 *
 * Son dos reportes distintos porque responden preguntas distintas: el cierre
 * dice cómo cerró el día, y la liquidación dice a quién hay que pagarle cuánto.
 * Salen de los mismos datos que muestra la app, así que no pueden diferir de la
 * pantalla.
 */

const DINERO = '#,##0.00'
const ROJO = '#B91C1C'
const GRIS_CLARO = '#F1F5F9'
const GRIS_BORDE = '#CBD5E1'

// --- Piezas para armar las hojas -------------------------------------------

function titulo(texto: string, ancho: number): Row {
  return [
    { value: texto, fontSize: 16, fontWeight: 'bold', textColor: ROJO, columnSpan: ancho },
    ...vacias(ancho - 1),
  ]
}

function subtitulo(texto: string, ancho: number): Row {
  return [{ value: texto, fontSize: 11, textColor: '#475569', columnSpan: ancho }, ...vacias(ancho - 1)]
}

function seccion(texto: string, ancho: number): Row {
  return [
    {
      value: texto,
      fontWeight: 'bold',
      backgroundColor: GRIS_CLARO,
      bottomBorderStyle: 'thin',
      bottomBorderColor: GRIS_BORDE,
      columnSpan: ancho,
    },
    ...vacias(ancho - 1),
  ]
}

function encabezados(textos: string[]): Row {
  return textos.map((texto) => ({
    value: texto,
    fontWeight: 'bold',
    backgroundColor: GRIS_CLARO,
    bottomBorderStyle: 'thin',
    bottomBorderColor: GRIS_BORDE,
    align: texto.includes('$') || texto === 'Cantidad' || texto === 'Mixtas' || texto.startsWith('Carreras')
      ? 'right'
      : 'left',
  })) as Row
}

function vacias(cuantas: number): Row {
  return Array.from({ length: Math.max(cuantas, 0) }, () => null)
}

const FILA_VACIA: Row = []

function dinero(valor: number, negrita = false): Cell {
  return { value: Number(valor), type: Number, format: DINERO, align: 'right', fontWeight: negrita ? 'bold' : undefined }
}

function texto(valor: string | null, negrita = false): Cell {
  return { value: valor ?? '', type: String, fontWeight: negrita ? 'bold' : undefined }
}

function entero(valor: number, negrita = false): Cell {
  return { value: Number(valor), type: Number, align: 'right', fontWeight: negrita ? 'bold' : undefined }
}

/** Renglón de resumen: concepto a la izquierda, monto en dólares y en bolívares. */
function renglonResumen(concepto: string, usd: number, tasa: number, negrita = false): Row {
  return [texto(concepto, negrita), dinero(usd, negrita), dinero(usd * tasa, negrita)]
}

// --- Cierre de jornada ------------------------------------------------------

const ANCHOS_CIERRE = [{ width: 30 }, { width: 16 }, { width: 18 }, { width: 14 }]

/**
 * Reporte de cierre: cómo cerró el día.
 *
 * Primero los totales, después el desglose por forma de pago y por zona, y al
 * final lo que quedó pendiente de revisar. El detalle de las órdenes va en su
 * propia hoja para que la primera se pueda imprimir en una página.
 */
export async function exportarCierre(
  fecha: string,
  ordenes: OrdenDetalle[],
  totales: TotalesCierre,
  tasa: number,
) {
  const conMargen = Math.abs(totales.margen_delivery_usd) >= 0.01
  const filas: Row[] = [
    titulo('Broaster Express La Candelaria', 4),
    subtitulo(`Cierre de jornada — ${formatearFecha(fecha)}`, 4),
    subtitulo(`Tasa del día: ${tasa} Bs/$`, 4),
    FILA_VACIA,

    seccion('Resumen', 4),
    [texto('Concepto', true), texto('Dólares', true), texto('Bolívares', true)],
    [texto('Órdenes'), entero(totales.ordenes)],
    renglonResumen('Ventas (sin delivery)', totales.ventas_usd, tasa),
    renglonResumen('Delivery cobrado', totales.delivery_cobrado_usd, tasa),
    renglonResumen('Total facturado', totales.total_usd, tasa, true),
    FILA_VACIA,
    renglonResumen('A pagar a repartidores', totales.delivery_pagado_usd, tasa),
  ]

  // El margen solo aparece si existe: hoy el repartidor cobra el delivery
  // completo, así que una fila en cero sería ruido.
  if (conMargen) filas.push(renglonResumen('Margen del delivery', totales.margen_delivery_usd, tasa))

  filas.push(FILA_VACIA, seccion('Por forma de pago', 4), encabezados(['Forma de pago', 'Cantidad', 'Bolívares', 'Dólares']))

  for (const [metodo, fila] of Object.entries(totales.por_metodo)) {
    filas.push([
      texto(ETIQUETA_METODO[metodo as MetodoPago] ?? metodo),
      entero(fila.cantidad),
      fila.monto_bs > 0 ? dinero(fila.monto_bs) : texto('—'),
      dinero(fila.monto_usd),
    ])
  }

  const totalMetodosUsd = Object.values(totales.por_metodo).reduce((s, f) => s + f.monto_usd, 0)
  filas.push([texto('Total cobrado', true), null, null, dinero(totalMetodosUsd, true)])

  // Por zona: dice de dónde viene el delivery y ayuda a revisar las tarifas.
  const porZona = new Map<string, { entregas: number; cobrado: number }>()
  for (const orden of ordenes.filter((o) => o.tipo !== 'pickup')) {
    const acumulado = porZona.get(orden.zona) ?? { entregas: 0, cobrado: 0 }
    acumulado.entregas += 1
    acumulado.cobrado += Number(orden.tarifa_cliente_usd)
    porZona.set(orden.zona, acumulado)
  }

  // Los pick up se cuentan aparte: entran en la caja, pero no son
  // una entrega y meterlos entre las zonas falsearía el reporte del delivery.
  const pickups = ordenes.filter((o) => o.tipo === 'pickup')
  if (pickups.length) {
    filas.push(
      FILA_VACIA,
      seccion('Pick Up', 4),
      [
        texto(`${pickups.length} pedido${pickups.length === 1 ? '' : 's'} que el cliente vino a buscar`),
        dinero(pickups.reduce((suma, o) => suma + Number(o.total_usd), 0), true),
      ],
    )
  }

  const entregas = ordenes.filter((o) => o.tipo !== 'pickup')
  if (entregas.length) {
    const conteo = carrerasPorMoneda(entregas)
    filas.push(
      FILA_VACIA,
      seccion('Carreras según la moneda con que se cobraron', 4),
      encabezados(['Cobrado en', 'Carreras', 'Delivery $']),
      ...(['USD', 'BS', 'MIXTO', 'SIN_PAGO'] as const)
        .filter((clave) => conteo[clave] > 0)
        .map((clave) => [
          texto(ETIQUETA_MONEDA_COBRO[clave]),
          entero(conteo[clave]),
          dinero(
            entregas
              .filter((o) => monedaDeCobro(o) === clave)
              .reduce((suma, o) => suma + Number(o.tarifa_cliente_usd), 0),
          ),
        ]),
    )
  }

  filas.push(FILA_VACIA, seccion('Por zona (solo delivery)', 4), encabezados(['Zona', 'Entregas', 'Delivery cobrado $']))
  for (const [zona, datos] of [...porZona.entries()].sort((a, b) => b[1].entregas - a[1].entregas)) {
    filas.push([texto(zona), entero(datos.entregas), dinero(datos.cobrado)])
  }

  // Lo que quedó por revisar. Va al final, pero es lo que hay que mirar primero
  // cuando algo no cuadra.
  const saltos = detectarSaltosDeFactura(ordenes.map((o) => o.numero_factura))
  const descuadradas = ordenes.filter((o) => Math.abs(o.diferencia_usd) > TOLERANCIA_DESCUADRE_USD)
  const sinRepartidor = ordenes.filter((o) => !o.repartidor_id && o.tipo !== 'pickup')

  if (saltos.length || descuadradas.length || sinRepartidor.length) {
    filas.push(FILA_VACIA, seccion('Revisar', 4))
    if (saltos.length) {
      filas.push([{ value: `Faltan facturas en el correlativo: ${saltos.join(', ')}`, textColor: ROJO, columnSpan: 4 }])
    }
    for (const orden of descuadradas) {
      filas.push([
        { value: `Factura ${orden.numero_factura}`, textColor: ROJO },
        {
          value: `${orden.diferencia_usd < 0 ? 'Faltan' : 'Sobran'} ${Math.abs(orden.diferencia_usd).toFixed(2)} $`,
          textColor: ROJO,
          columnSpan: 3,
        },
      ])
    }
    for (const orden of sinRepartidor) {
      filas.push([
        { value: `Factura ${orden.numero_factura}`, textColor: ROJO },
        { value: 'Sin repartidor asignado', textColor: ROJO, columnSpan: 3 },
      ])
    }
  }

  await writeXlsxFile(
    [
      { data: filas, sheet: 'Cierre', columns: ANCHOS_CIERRE },
      { data: hojaDetalle(ordenes), sheet: 'Detalle', columns: ANCHOS_DETALLE, stickyRowsCount: 1 },
    ],
    { fontFamily: 'Calibri', fontSize: 11 },
  ).toFile(`cierre-${fecha}.xlsx`)
}

// --- Detalle de órdenes (hoja compartida) -----------------------------------

const ANCHOS_DETALLE = [
  { width: 11 },
  { width: 16 },
  { width: 24 },
  { width: 16 },
  { width: 34 },
  { width: 18 },
  { width: 18 },
  { width: 11 },
  { width: 11 },
  { width: 11 },
  { width: 11 },
  { width: 12 },
  { width: 12 },
]

function hojaDetalle(ordenes: OrdenDetalle[]): Row[] {
  const filas: Row[] = [
    encabezados([
      'Factura',
      'Tipo',
      'Cliente',
      'Teléfono',
      'Dirección',
      'Zona',
      'Repartidor',
      'Pedido $',
      'Delivery $',
      'Total $',
      'Pagado $',
      'Diferencia $',
      'Estado',
    ]),
  ]

  for (const orden of ordenes) {
    const descuadrada = Math.abs(orden.diferencia_usd) > TOLERANCIA_DESCUADRE_USD
    filas.push([
      texto(orden.numero_factura),
      texto(ETIQUETA_TIPO[orden.tipo]),
      texto(orden.cliente_nombre),
      texto(orden.cliente_telefono),
      texto(orden.direccion),
      texto(orden.zona),
      // "SIN ASIGNAR" en vez de una celda vacía: la fila que no se le paga a
      // nadie tiene que saltar a la vista.
      orden.repartidor
        ? texto(orden.repartidor)
        : orden.tipo === 'pickup'
          ? texto('—')
          : { value: 'SIN ASIGNAR', type: String, textColor: ROJO },
      dinero(orden.monto_pedido_usd),
      dinero(orden.tarifa_cliente_usd),
      dinero(orden.total_usd),
      dinero(orden.pagado_usd),
      {
        value: Number(orden.diferencia_usd),
        type: Number,
        format: DINERO,
        align: 'right',
        textColor: descuadrada ? ROJO : undefined,
      },
      texto(ETIQUETA_ESTADO[orden.estado]),
    ])
  }

  return filas
}

// --- Liquidación de repartidores --------------------------------------------

const ANCHOS_LIQUIDACION = [{ width: 14 }, { width: 12 }, { width: 26 }, { width: 22 }, { width: 14 }]

/**
 * Liquidación: a quién hay que pagarle cuánto.
 *
 * Va agrupada por repartidor, con sus carreras listadas debajo y el subtotal al
 * cierre de cada grupo. Así el repartidor puede revisar carrera por carrera lo
 * que se le está pagando, que es justo el reclamo que hoy no se puede resolver.
 */
export async function exportarLiquidacion(desde: string, hasta: string, ordenes: OrdenDetalle[]) {
  const conRepartidor = ordenes.filter((o) => o.repartidor_id && o.estado !== 'anulada' && o.tipo !== 'pickup')
  const porRepartidor = new Map<string, OrdenDetalle[]>()
  for (const orden of conRepartidor) {
    const nombre = orden.repartidor ?? 'Sin nombre'
    porRepartidor.set(nombre, [...(porRepartidor.get(nombre) ?? []), orden])
  }

  const rango =
    desde === hasta ? formatearFecha(desde) : `Del ${formatearFecha(desde)} al ${formatearFecha(hasta)}`

  const filas: Row[] = [
    titulo('Broaster Express La Candelaria', 5),
    subtitulo(`Liquidación de repartidores — ${rango}`, 5),
    FILA_VACIA,
  ]

  let totalGeneral = 0
  let carrerasGenerales = 0

  for (const nombre of [...porRepartidor.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
    const suyas = porRepartidor.get(nombre)!
    const subtotal = suyas.reduce((suma, o) => suma + Number(o.pago_repartidor_usd), 0)
    totalGeneral += subtotal
    carrerasGenerales += suyas.length

    filas.push(
      [
        {
          value: nombre,
          fontWeight: 'bold',
          fontSize: 13,
          textColor: ROJO,
          bottomBorderStyle: 'thin',
          bottomBorderColor: ROJO,
          columnSpan: 5,
        },
        ...vacias(4),
      ],
      encabezados(['Fecha', 'Factura', 'Cliente', 'Cobrado en', 'A pagar $']),
    )

    for (const orden of [...suyas].sort(
      (a, b) =>
        a.fecha_operativa.localeCompare(b.fecha_operativa) ||
        a.numero_factura.localeCompare(b.numero_factura, 'es', { numeric: true }),
    )) {
      filas.push([
        texto(formatearFecha(orden.fecha_operativa)),
        texto(orden.numero_factura),
        texto(orden.cliente_nombre),
        texto(ETIQUETA_MONEDA_COBRO[monedaDeCobro(orden)]),
        dinero(orden.pago_repartidor_usd),
      ])
    }

    filas.push(
      [
        {
          value: `${suyas.length} carrera${suyas.length === 1 ? '' : 's'} — ${resumenMonedas(suyas)}`,
          fontWeight: 'bold',
          columnSpan: 4,
        },
        ...vacias(3),
        {
          value: subtotal,
          type: Number,
          format: DINERO,
          align: 'right',
          fontWeight: 'bold',
          topBorderStyle: 'thin',
          topBorderColor: GRIS_BORDE,
        },
      ],
      FILA_VACIA,
    )
  }

  filas.push([
    { value: 'TOTAL A PAGAR', fontWeight: 'bold', fontSize: 12, columnSpan: 3 },
    ...vacias(2),
    { value: `${carrerasGenerales} carreras`, fontWeight: 'bold', align: 'right' },
    {
      value: totalGeneral,
      type: Number,
      format: DINERO,
      align: 'right',
      fontWeight: 'bold',
      fontSize: 12,
      topBorderStyle: 'double',
      topBorderColor: '#0F172A',
    },
  ])

  // Las que no se le pagan a nadie se listan aparte, para que no se pierdan.
  const sinAsignar = ordenes.filter((o) => !o.repartidor_id && o.estado !== 'anulada' && o.tipo !== 'pickup')
  if (sinAsignar.length) {
    filas.push(FILA_VACIA, seccion('Carreras sin repartidor asignado', 5), encabezados(['Fecha', 'Factura', 'Cliente', 'Zona', 'Delivery $']))
    for (const orden of sinAsignar) {
      filas.push([
        texto(formatearFecha(orden.fecha_operativa)),
        { value: orden.numero_factura, type: String, textColor: ROJO },
        texto(orden.cliente_nombre),
        texto(orden.zona),
        dinero(orden.tarifa_cliente_usd),
      ])
    }
  }

  // Hoja de resumen: una línea por repartidor, para firmar y pagar.
  //
  // Lo que se le paga sale siempre en dólares —la tarifa por zona está en
  // dólares—, pero separado según con qué plata entró cada carrera: así se sabe
  // cuánto de ese total conviene pagarlo con los dólares de la caja y cuánto con
  // lo que entró en bolívares.
  //
  // Las mixtas (parte pago móvil, parte efectivo) solo agregan su par de
  // columnas si alguna ocurrió; si no, serían dos columnas de ceros.
  const totalConteo = carrerasPorMoneda(conRepartidor)
  const hayMixtas = totalConteo.MIXTO > 0 || totalConteo.SIN_PAGO > 0

  const cabecerasResumen = [
    'Repartidor',
    'Carreras',
    'Carreras en $',
    'A pagar por esas $',
    'Carreras en Bs',
    'A pagar por esas $',
    ...(hayMixtas ? ['Carreras mixtas', 'A pagar por esas $'] : []),
    'TOTAL a pagar $',
  ]

  const resumen: Row[] = [
    titulo('Resumen de pago', cabecerasResumen.length),
    subtitulo(rango, cabecerasResumen.length),
    subtitulo('Todos los montos en dólares, agrupados según con qué moneda cobró el cliente.', cabecerasResumen.length),
    FILA_VACIA,
    encabezados(cabecerasResumen),
  ]

  for (const nombre of [...porRepartidor.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
    const suyas = porRepartidor.get(nombre)!
    const conteo = carrerasPorMoneda(suyas)
    const pagar = pagoPorMoneda(suyas)
    resumen.push([
      texto(nombre),
      entero(suyas.length),
      entero(conteo.USD),
      dinero(pagar.USD),
      entero(conteo.BS),
      dinero(pagar.BS),
      ...(hayMixtas
        ? [entero(conteo.MIXTO + conteo.SIN_PAGO), dinero(pagar.MIXTO + pagar.SIN_PAGO)]
        : []),
      dinero(suyas.reduce((suma, o) => suma + Number(o.pago_repartidor_usd), 0), true),
    ])
  }

  const totalPagar = pagoPorMoneda(conRepartidor)
  resumen.push([
    texto('Total', true),
    entero(carrerasGenerales, true),
    entero(totalConteo.USD, true),
    dinero(totalPagar.USD, true),
    entero(totalConteo.BS, true),
    dinero(totalPagar.BS, true),
    ...(hayMixtas
      ? [entero(totalConteo.MIXTO + totalConteo.SIN_PAGO, true), dinero(totalPagar.MIXTO + totalPagar.SIN_PAGO, true)]
      : []),
    dinero(totalGeneral, true),
  ])

  await writeXlsxFile(
    [
      { data: filas, sheet: 'Liquidación', columns: ANCHOS_LIQUIDACION },
      {
        data: resumen,
        sheet: 'Resumen',
        columns: [
          { width: 26 },
          { width: 10 },
          { width: 13 },
          { width: 18 },
          { width: 14 },
          { width: 18 },
          ...(hayMixtas ? [{ width: 15 }, { width: 18 }] : []),
          { width: 16 },
        ],
      },
    ],
    { fontFamily: 'Calibri', fontSize: 11 },
  ).toFile(`liquidacion-${desde}-a-${hasta}.xlsx`)
}

// --- Cálculos compartidos ---------------------------------------------------

/**
 * Si el local se queda con alguna parte del delivery.
 *
 * Hoy al repartidor se le paga el delivery completo, así que el margen es cero
 * en todas las zonas y mostrar esas columnas sería llenar el reporte de ceros.
 * Se calcula en vez de darlo por sentado para que el día que se decida dejar un
 * margen, las columnas reaparezcan solas sin tocar código.
 */
export function hayMargenDeDelivery(filas: LiquidacionRepartidor[]): boolean {
  return filas.some((fila) => Math.abs(Number(fila.margen_usd)) >= 0.01)
}

/**
 * Agrupa la liquidación por repartidor sumando todos los días del rango.
 *
 * La vista SQL devuelve una fila por repartidor y por día; para pagarle a
 * alguien la semana completa hace falta el consolidado.
 */
export function consolidarLiquidacion(filas: LiquidacionRepartidor[]): LiquidacionRepartidor[] {
  const porRepartidor = new Map<string, LiquidacionRepartidor>()

  for (const fila of filas) {
    const acumulado = porRepartidor.get(fila.repartidor_id)
    if (acumulado) {
      acumulado.carreras += Number(fila.carreras)
      acumulado.total_pagar_usd += Number(fila.total_pagar_usd)
      acumulado.total_cobrado_usd += Number(fila.total_cobrado_usd)
      acumulado.margen_usd += Number(fila.margen_usd)
    } else {
      porRepartidor.set(fila.repartidor_id, {
        ...fila,
        carreras: Number(fila.carreras),
        total_pagar_usd: Number(fila.total_pagar_usd),
        total_cobrado_usd: Number(fila.total_cobrado_usd),
        margen_usd: Number(fila.margen_usd),
      })
    }
  }

  return [...porRepartidor.values()].sort((a, b) => a.repartidor.localeCompare(b.repartidor, 'es'))
}

/**
 * Arma la liquidación a partir de las órdenes ya cargadas en el navegador.
 *
 * Es la misma cuenta que hace la vista `v_liquidacion_repartidores` en SQL, y
 * existe para no tener que ir al servidor otra vez cuando las órdenes del rango
 * ya están en pantalla. Las órdenes sin repartidor quedan fuera a propósito:
 * no se le pueden pagar a nadie.
 */
export function liquidacionDesdeOrdenes(ordenes: OrdenDetalle[]): LiquidacionRepartidor[] {
  const filas: LiquidacionRepartidor[] = []
  const indice = new Map<string, LiquidacionRepartidor>()

  for (const orden of ordenes) {
    if (!orden.repartidor_id || orden.estado === 'anulada' || orden.tipo === 'pickup') continue
    const clave = `${orden.fecha_operativa}|${orden.repartidor_id}`
    let fila = indice.get(clave)
    if (!fila) {
      fila = {
        fecha_operativa: orden.fecha_operativa,
        repartidor_id: orden.repartidor_id,
        repartidor: orden.repartidor ?? 'Sin nombre',
        carreras: 0,
        total_pagar_usd: 0,
        total_cobrado_usd: 0,
        margen_usd: 0,
      }
      indice.set(clave, fila)
      filas.push(fila)
    }
    fila.carreras += 1
    fila.total_pagar_usd += Number(orden.pago_repartidor_usd)
    fila.total_cobrado_usd += Number(orden.tarifa_cliente_usd)
    fila.margen_usd += Number(orden.margen_delivery_usd)
  }

  return filas
}
