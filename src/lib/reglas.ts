/**
 * Reglas de negocio del delivery.
 *
 * Todo aquí es función pura: sin red, sin React, sin Supabase. Son las
 * verificaciones que hoy hace la administradora comanda por comanda contra el
 * papel impreso, movidas al momento en que la cajera teclea — cuando el cliente
 * todavía está en línea y el error se puede corregir.
 */

import type { BorradorPago, MetodoPago, Moneda } from './tipos'

/** Métodos que no dejan rastro de referencia que se pueda cotejar después. */
const METODOS_EFECTIVO: MetodoPago[] = ['efectivo_bs', 'efectivo_usd']

/** Métodos que se liquidan contra un banco venezolano. */
const METODOS_CON_BANCO: MetodoPago[] = ['pago_movil', 'transferencia']

/** Moneda en la que entra cada método. El efectivo $ y Zelle entran en dólares. */
const MONEDA_POR_METODO: Record<MetodoPago, Moneda> = {
  pago_movil: 'BS',
  transferencia: 'BS',
  efectivo_bs: 'BS',
  efectivo_usd: 'USD',
  zelle: 'USD',
  binance: 'USD',
  punto_venta: 'BS',
}

export function requiereReferencia(metodo: MetodoPago): boolean {
  return !METODOS_EFECTIVO.includes(metodo)
}

/**
 * Si hace falta saber a cuál de nuestras cuentas entró la plata.
 *
 * Sin ese dato no hay en qué banco entrar a confirmar el pago, que es
 * justamente el primer paso del proceso hoy.
 */
export function requiereCuenta(metodo: MetodoPago): boolean {
  return METODOS_CON_BANCO.includes(metodo)
}

/** El banco del que salió el pago. Es opcional: ayuda, pero no se verifica con él. */
export function admiteBancoEmisor(metodo: MetodoPago): boolean {
  return METODOS_CON_BANCO.includes(metodo)
}

export function requiereCaptura(metodo: MetodoPago): boolean {
  return !METODOS_EFECTIVO.includes(metodo)
}

export function monedaDeMetodo(metodo: MetodoPago): Moneda {
  return MONEDA_POR_METODO[metodo]
}

/**
 * Normaliza una referencia para poder compararla.
 *
 * Las capturas traen la referencia de formas distintas según el banco
 * ("Ref: 00123456", "0012-3456"), así que se comparan solo los dígitos. Además
 * se ignoran los ceros a la izquierda: el mismo pago aparece como "0012345678"
 * en una app y "12345678" en otra, y son la misma transacción.
 */
export function normalizarReferencia(referencia: string): string {
  const soloDigitos = referencia.replace(/\D/g, '')
  const sinCeros = soloDigitos.replace(/^0+/, '')
  return sinCeros || soloDigitos
}

/**
 * Compara dos referencias.
 *
 * Los bancos venezolanos muestran la referencia recortada a los últimos 4-8
 * dígitos según la app, así que si una es sufijo de la otra y comparten al
 * menos 4 dígitos, se consideran la misma transacción. Es deliberadamente
 * amplio: preferimos avisar de más y que la cajera descarte, a dejar pasar una
 * captura reenviada dos veces.
 */
export function referenciasCoinciden(a: string, b: string): boolean {
  const na = normalizarReferencia(a)
  const nb = normalizarReferencia(b)
  if (!na || !nb) return false
  if (na === nb) return true

  const corta = na.length < nb.length ? na : nb
  const larga = na.length < nb.length ? nb : na
  return corta.length >= 4 && larga.endsWith(corta)
}

/**
 * A partir de cuántos dígitos una referencia repetida es sospechosa de verdad.
 *
 * Los bancos venezolanos muestran la referencia recortada a 4 dígitos, y con
 * 10.000 valores posibles dos pagos distintos comparten los mismos 4 dígitos
 * con toda naturalidad en el volumen de una semana. De 8 dígitos en adelante,
 * una repetición sí es señal de la misma captura mandada dos veces.
 */
export const DIGITOS_REFERENCIA_CONFIABLE = 8

export function referenciaEsConfiable(referencia: string): boolean {
  return normalizarReferencia(referencia).length >= DIGITOS_REFERENCIA_CONFIABLE
}

/**
 * Qué tan seguro es que dos pagos sean en realidad el mismo.
 *
 * - `seguro`: misma referencia y mismo monto, o referencia larga repetida.
 *   Casi con certeza es la captura reenviada.
 * - `posible`: coinciden los 4 dígitos pero el monto es distinto. Con
 *   referencias cortas esto pasa solo, así que se avisa sin trancar la carga.
 */
export type FuerzaDuplicado = 'seguro' | 'posible'

export function fuerzaDeDuplicado(
  referencia: string,
  monto: number,
  montoExistente: number,
): FuerzaDuplicado {
  if (referenciaEsConfiable(referencia)) return 'seguro'
  // Los montos vienen de la misma moneda, así que se comparan con la tolerancia
  // de un centavo para no tropezar con el redondeo.
  return Math.abs(monto - montoExistente) < 0.01 ? 'seguro' : 'posible'
}

export interface Problema {
  campo: string
  mensaje: string
  /** `error` bloquea el guardado; `aviso` solo advierte y deja continuar. */
  nivel: 'error' | 'aviso'
}

export interface DatosOrdenAValidar {
  numero_factura: string
  cliente_nombre: string
  direccion: string
  zona_id: string
  repartidor_id: string | null
  monto_pedido_usd: string
  tarifa_cliente_usd: number
  tasa_bs_por_usd: number
  pagos: BorradorPago[]
}

/**
 * Convierte a número tolerando coma decimal, que es como se teclea aquí.
 *
 * Un campo vacío devuelve NaN, no cero: `Number('')` da 0, y eso haría que un
 * monto sin llenar se guardara silenciosamente como $0 en vez de reclamarse.
 */
export function aNumero(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, '').replace(',', '.')
  if (!limpio) return NaN
  const valor = Number(limpio)
  return Number.isFinite(valor) ? valor : NaN
}

/**
 * Prepara un texto para buscar: sin acentos, en minúsculas y sin espacios de
 * sobra.
 *
 * Con 104 zonas, la cajera va a teclear "penon" o "paraiso" con el cliente
 * esperando; exigirle la ñ y las tildes sería hacerle perder tiempo.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas de acento que deja NFD
    .toLowerCase()
    .trim()
}

/**
 * Ordena las coincidencias de una búsqueda poniendo primero las que empiezan
 * con lo tecleado. Buscar "la" debe mostrar "La Bandera" antes que "Boleíta".
 */
export function buscarPorNombre<T extends { nombre: string }>(elementos: T[], consulta: string): T[] {
  const busqueda = normalizarTexto(consulta)
  if (!busqueda) return elementos

  const coincidencias = elementos
    .map((elemento) => ({ elemento, posicion: normalizarTexto(elemento.nombre).indexOf(busqueda) }))
    .filter(({ posicion }) => posicion >= 0)

  return coincidencias
    .sort((a, b) => a.posicion - b.posicion || a.elemento.nombre.localeCompare(b.elemento.nombre, 'es'))
    .map(({ elemento }) => elemento)
}

/**
 * Formatea en dólares como se escriben en el local: `$5,00`.
 *
 * Hace falta `narrowSymbol` porque en Venezuela la moneda local es el bolívar y,
 * por defecto, Intl desambigua el dólar como "USD 5,00" — más largo y más raro
 * de leer para quien usa la app, sobre todo en las columnas angostas de las
 * tablas.
 */
export function formatearUSD(valor: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
  }).format(valor)
}

export function formatearBS(valor: number): string {
  return `Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor)}`
}

export function formatearMonto(valor: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatearUSD(valor) : formatearBS(valor)
}

/** Lleva cualquier pago a USD usando la tasa de esa orden, para poder sumarlos. */
export function pagoEnUSD(monto: number, moneda: Moneda, tasa: number): number {
  if (moneda === 'USD') return monto
  if (!tasa || tasa <= 0) return 0
  return monto / tasa
}

/** Suma de todo lo pagado, en USD. */
export function totalPagadoUSD(pagos: BorradorPago[], tasa: number): number {
  return pagos.reduce((suma, pago) => {
    const monto = aNumero(pago.monto)
    if (!Number.isFinite(monto)) return suma
    return suma + pagoEnUSD(monto, pago.moneda, tasa)
  }, 0)
}

/**
 * Tolerancia del descuadre, en dólares.
 *
 * Un pago en Bs convertido a USD casi nunca da el total exacto por el redondeo
 * de la tasa, así que una diferencia de centavos no es un error real. Por
 * encima de esto sí se avisa.
 */
export const TOLERANCIA_DESCUADRE_USD = 0.05

export interface ResumenOrden {
  montoPedido: number
  tarifaDelivery: number
  total: number
  pagado: number
  diferencia: number
  cuadra: boolean
}

export function calcularResumen(datos: DatosOrdenAValidar): ResumenOrden {
  const montoPedido = aNumero(datos.monto_pedido_usd)
  const pedidoValido = Number.isFinite(montoPedido) ? montoPedido : 0
  const total = pedidoValido + datos.tarifa_cliente_usd
  const pagado = totalPagadoUSD(datos.pagos, datos.tasa_bs_por_usd)
  const diferencia = pagado - total

  return {
    montoPedido: pedidoValido,
    tarifaDelivery: datos.tarifa_cliente_usd,
    total,
    pagado,
    diferencia,
    cuadra: Math.abs(diferencia) <= TOLERANCIA_DESCUADRE_USD,
  }
}

/**
 * Valida una orden completa antes de guardarla.
 *
 * Devuelve todos los problemas juntos, no el primero: quien está cargando con
 * el cliente esperando necesita ver de una vez todo lo que falta.
 */
export function validarOrden(datos: DatosOrdenAValidar): Problema[] {
  const problemas: Problema[] = []

  if (!datos.numero_factura.trim()) {
    problemas.push({ campo: 'numero_factura', mensaje: 'Falta el número de factura.', nivel: 'error' })
  }

  if (!datos.cliente_nombre.trim()) {
    problemas.push({ campo: 'cliente_nombre', mensaje: 'Falta el nombre del cliente.', nivel: 'error' })
  }

  if (!datos.direccion.trim()) {
    problemas.push({ campo: 'direccion', mensaje: 'Falta la dirección de entrega.', nivel: 'error' })
  }

  if (!datos.zona_id) {
    problemas.push({ campo: 'zona_id', mensaje: 'Elige la zona: de ahí sale la tarifa del delivery.', nivel: 'error' })
  }

  const monto = aNumero(datos.monto_pedido_usd)
  if (!Number.isFinite(monto)) {
    problemas.push({ campo: 'monto_pedido_usd', mensaje: 'El monto del pedido no es un número válido.', nivel: 'error' })
  } else if (monto < 0) {
    problemas.push({ campo: 'monto_pedido_usd', mensaje: 'El monto del pedido no puede ser negativo.', nivel: 'error' })
  } else if (monto === 0) {
    problemas.push({ campo: 'monto_pedido_usd', mensaje: 'El pedido está en $0. ¿Es correcto?', nivel: 'aviso' })
  }

  if (!datos.tasa_bs_por_usd || datos.tasa_bs_por_usd <= 0) {
    problemas.push({
      campo: 'tasa',
      mensaje: 'Falta cargar la tasa del día. Sin ella no se puede cuadrar lo pagado en Bs.',
      nivel: 'error',
    })
  }

  // Sin repartidor la orden no se puede liquidar, pero se permite guardarla:
  // muchas veces se asigna después, cuando el motorizado vuelve al local.
  if (!datos.repartidor_id) {
    problemas.push({
      campo: 'repartidor_id',
      mensaje: 'Sin repartidor asignado. Hay que asignarlo antes de cerrar el día.',
      nivel: 'aviso',
    })
  }

  if (datos.pagos.length === 0) {
    problemas.push({ campo: 'pagos', mensaje: 'Agrega al menos un pago.', nivel: 'error' })
  }

  datos.pagos.forEach((pago, indice) => {
    const etiqueta = `Pago ${indice + 1}`
    const montoPago = aNumero(pago.monto)

    if (!Number.isFinite(montoPago) || montoPago <= 0) {
      problemas.push({ campo: `pago.${pago.clave}.monto`, mensaje: `${etiqueta}: falta el monto.`, nivel: 'error' })
    }

    if (requiereReferencia(pago.metodo) && !pago.referencia.trim()) {
      problemas.push({
        campo: `pago.${pago.clave}.referencia`,
        mensaje: `${etiqueta}: falta la referencia.`,
        nivel: 'error',
      })
    }

    if (requiereCuenta(pago.metodo) && !pago.cuenta_id) {
      problemas.push({
        campo: `pago.${pago.clave}.cuenta_id`,
        mensaje: `${etiqueta}: falta a cuál de nuestras cuentas entró.`,
        nivel: 'error',
      })
    }

    if (requiereCaptura(pago.metodo) && !pago.archivo && !pago.imagen_path) {
      problemas.push({
        campo: `pago.${pago.clave}.archivo`,
        mensaje: `${etiqueta}: sin captura adjunta. La administradora no podrá verificarlo.`,
        nivel: 'aviso',
      })
    }
  })

  // Dos pagos con la misma referencia dentro de la misma orden.
  datos.pagos.forEach((pago, i) => {
    if (!pago.referencia.trim()) return
    const anterior = datos.pagos.find(
      (otro, j) => j < i && otro.referencia.trim() && referenciasCoinciden(otro.referencia, pago.referencia),
    )
    if (!anterior) return

    // Con referencias de 4 dígitos, que dos coincidan por casualidad es
    // posible; si además el monto es el mismo, ya no lo es.
    const fuerza = fuerzaDeDuplicado(pago.referencia, aNumero(pago.monto), aNumero(anterior.monto))
    problemas.push({
      campo: `pago.${pago.clave}.referencia`,
      mensaje:
        fuerza === 'seguro'
          ? `Pago ${i + 1}: esa referencia y ese monto ya están en esta misma orden.`
          : `Pago ${i + 1}: coincide la referencia con otro pago de esta orden, pero el monto es distinto. Revisa que no sea un error de tipeo.`,
      nivel: fuerza === 'seguro' ? 'error' : 'aviso',
    })
  })

  const resumen = calcularResumen(datos)
  if (datos.pagos.length > 0 && Number.isFinite(monto) && !resumen.cuadra) {
    const falta = resumen.diferencia < 0
    problemas.push({
      campo: 'pagos',
      mensaje: falta
        ? `Faltan ${formatearUSD(Math.abs(resumen.diferencia))} por cobrar (total ${formatearUSD(resumen.total)}, pagado ${formatearUSD(resumen.pagado)}).`
        : `El cliente pagó ${formatearUSD(resumen.diferencia)} de más (total ${formatearUSD(resumen.total)}, pagado ${formatearUSD(resumen.pagado)}).`,
      nivel: 'aviso',
    })
  }

  return problemas
}

export function tieneErrores(problemas: Problema[]): boolean {
  return problemas.some((p) => p.nivel === 'error')
}

/**
 * Busca huecos en el correlativo de facturas del día.
 *
 * Un salto suele significar que una comanda se cargó en la tablet pero nunca
 * llegó a este sistema — exactamente el tipo de orden que hoy se descubre días
 * después, cuando ya nadie recuerda qué pasó.
 *
 * Solo considera las facturas cuyo número es puramente numérico; si el local
 * usa prefijos de letras, se ignoran y no se reporta nada.
 */
export function detectarSaltosDeFactura(numeros: string[]): number[] {
  const valores = numeros
    .map((n) => n.trim())
    .filter((n) => /^\d+$/.test(n))
    .map(Number)
    .filter((n) => Number.isSafeInteger(n))

  if (valores.length < 2) return []

  const presentes = new Set(valores)
  const minimo = Math.min(...valores)
  const maximo = Math.max(...valores)

  // Un rango disparatado (por ejemplo, alguien tecleó un número con un dígito
  // de más) generaría miles de "faltantes" inútiles. Mejor no reportar nada.
  if (maximo - minimo > 5000) return []

  const faltantes: number[] = []
  for (let n = minimo + 1; n < maximo; n++) {
    if (!presentes.has(n)) faltantes.push(n)
  }
  return faltantes
}

/**
 * Calcula a qué día operativo pertenece un instante dado.
 *
 * El local cierra de madrugada, así que una orden facturada a la 1 a.m.
 * pertenece a la jornada del día anterior. `horaCorte` es la hora (0-23) a
 * partir de la cual empieza a contar el día nuevo.
 */
export function fechaOperativa(momento: Date, horaCorte: number): string {
  const referencia = new Date(momento)
  if (referencia.getHours() < horaCorte) {
    referencia.setDate(referencia.getDate() - 1)
  }
  const año = referencia.getFullYear()
  const mes = String(referencia.getMonth() + 1).padStart(2, '0')
  const dia = String(referencia.getDate()).padStart(2, '0')
  return `${año}-${mes}-${dia}`
}

/** Formatea una fecha `YYYY-MM-DD` sin que el navegador la mueva de zona horaria. */
export function formatearFecha(fecha: string): string {
  const [año, mes, dia] = fecha.split('-').map(Number)
  if (!año || !mes || !dia) return fecha
  return new Date(año, mes - 1, dia).toLocaleDateString('es-VE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
