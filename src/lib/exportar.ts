import writeXlsxFile, { getSheetData, type Column } from 'write-excel-file/browser'
import { ETIQUETA_ESTADO, type LiquidacionRepartidor, type OrdenDetalle } from './tipos'

/**
 * Exportación a Excel.
 *
 * Sigue existiendo porque la administradora y la contabilidad trabajan con
 * Excel, pero ya no es el paso donde se teclea: el archivo sale de los mismos
 * datos que ve la app, así que no puede diferir de la pantalla.
 */

const ENCABEZADO = { fontWeight: 'bold', backgroundColor: '#FEE2E2' } as const
const MONEDA = { type: Number, format: '#,##0.00' } as const

function texto<T>(header: string, leer: (fila: T) => string | null, width = 18): Column<T> {
  return {
    header: { value: header, ...ENCABEZADO },
    width,
    cell: (fila) => ({ type: String, value: leer(fila) ?? '' }),
  }
}

function dinero<T>(header: string, leer: (fila: T) => number, width = 13): Column<T> {
  return {
    header: { value: header, ...ENCABEZADO },
    width,
    cell: (fila) => ({ ...MONEDA, value: Number(leer(fila)) }),
  }
}

function entero<T>(header: string, leer: (fila: T) => number, width = 11): Column<T> {
  return {
    header: { value: header, ...ENCABEZADO },
    width,
    cell: (fila) => ({ type: Number, value: Number(leer(fila)) }),
  }
}

const COLUMNAS_DETALLE: Column<OrdenDetalle>[] = [
  texto('Fecha', (o) => o.fecha_operativa, 12),
  texto('Factura', (o) => o.numero_factura, 11),
  texto('Cliente', (o) => o.cliente_nombre, 26),
  texto('Teléfono', (o) => o.cliente_telefono, 16),
  texto('Dirección', (o) => o.direccion, 38),
  texto('Zona', (o) => o.zona, 18),
  // "SIN ASIGNAR" en vez de una celda vacía: la fila que no se le paga a nadie
  // tiene que saltar a la vista en el Excel.
  texto('Repartidor', (o) => o.repartidor ?? 'SIN ASIGNAR', 18),
  dinero('Pedido $', (o) => o.monto_pedido_usd),
  dinero('Delivery $', (o) => o.tarifa_cliente_usd),
  dinero('Total $', (o) => o.total_usd),
  dinero('Pagado $', (o) => o.pagado_usd),
  dinero('Diferencia $', (o) => o.diferencia_usd),
  dinero('Pago repartidor $', (o) => o.pago_repartidor_usd, 18),
  entero('Tasa Bs/$', (o) => o.tasa_bs_por_usd),
  texto('Estado', (o) => ETIQUETA_ESTADO[o.estado], 12),
  texto('Cargada por', (o) => o.cargada_por, 18),
]

const COLUMNAS_LIQUIDACION: Column<LiquidacionRepartidor>[] = [
  texto('Fecha', (l) => l.fecha_operativa, 12),
  texto('Repartidor', (l) => l.repartidor, 26),
  entero('Carreras', (l) => l.carreras),
  dinero('A pagar $', (l) => l.total_pagar_usd),
  dinero('Cobrado al cliente $', (l) => l.total_cobrado_usd, 20),
  dinero('Margen $', (l) => l.margen_usd),
]

/** Un solo archivo con las dos hojas que hoy son dos cuadros separados. */
export async function exportarExcel(
  ordenes: OrdenDetalle[],
  liquidacion: LiquidacionRepartidor[],
  nombreArchivo: string,
) {
  await writeXlsxFile([
    {
      data: getSheetData(ordenes, COLUMNAS_DETALLE),
      sheet: 'Detalle',
      columns: COLUMNAS_DETALLE.map(({ width }) => ({ width })),
      stickyRowsCount: 1,
    },
    {
      data: getSheetData(liquidacion, COLUMNAS_LIQUIDACION),
      sheet: 'Liquidación',
      columns: COLUMNAS_LIQUIDACION.map(({ width }) => ({ width })),
      stickyRowsCount: 1,
    },
  ]).toFile(nombreArchivo)
}

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
    if (!orden.repartidor_id || orden.estado === 'anulada') continue
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
