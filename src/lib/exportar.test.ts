import { describe, expect, it } from 'vitest'
import {
  carrerasPorMoneda,
  consolidarLiquidacion,
  hayMargenDeDelivery,
  liquidacionDesdeOrdenes,
  pagoPorMoneda,
  resumenMonedas,
} from './exportar'
import type { LiquidacionRepartidor, OrdenDetalle } from './tipos'

/**
 * La liquidación es el número con el que se le paga a una persona real, así que
 * es la cuenta que más importa que esté bien.
 */

function orden(parcial: Partial<OrdenDetalle> = {}): OrdenDetalle {
  const tarifa = parcial.tarifa_cliente_usd ?? 2
  const pago = parcial.pago_repartidor_usd ?? 1.5
  return {
    id: Math.random().toString(36).slice(2),
    fecha_operativa: '2026-08-12',
    numero_factura: '1001',
    tipo: 'delivery',
    cliente_nombre: 'Cliente',
    cliente_telefono: null,
    direccion: 'Una dirección',
    zona: 'La Candelaria',
    tarifa_cliente_usd: tarifa,
    pago_repartidor_usd: pago,
    margen_delivery_usd: tarifa - pago,
    repartidor: 'Luis',
    repartidor_id: 'rep-1',
    monto_pedido_usd: 10,
    total_usd: 10 + tarifa,
    tasa_bs_por_usd: 40,
    estado: 'verificada',
    notas: null,
    cargada_por: 'Cajera',
    creada_en: '2026-08-12T20:00:00Z',
    pagado_usd: 10 + tarifa,
    pagado_divisa_usd: 0,
    pagado_bs: (10 + tarifa) * 40,
    diferencia_usd: 0,
    cantidad_pagos: 1,
    facturada_aparte: false,
    referencias: '004521887730',
    ...parcial,
  }
}

describe('liquidacionDesdeOrdenes', () => {
  it('cuenta las carreras y suma lo que hay que pagarle a cada repartidor', () => {
    const filas = liquidacionDesdeOrdenes([
      orden({ pago_repartidor_usd: 1.5 }),
      orden({ pago_repartidor_usd: 2.5 }),
    ])

    expect(filas).toHaveLength(1)
    expect(filas[0].carreras).toBe(2)
    expect(filas[0].total_pagar_usd).toBe(4)
  })

  it('separa a cada repartidor', () => {
    const filas = liquidacionDesdeOrdenes([
      orden({ repartidor_id: 'rep-1', repartidor: 'Luis' }),
      orden({ repartidor_id: 'rep-2', repartidor: 'Ana' }),
      orden({ repartidor_id: 'rep-2', repartidor: 'Ana' }),
    ])

    expect(filas).toHaveLength(2)
    expect(filas.find((f) => f.repartidor === 'Ana')?.carreras).toBe(2)
    expect(filas.find((f) => f.repartidor === 'Luis')?.carreras).toBe(1)
  })

  it('separa por día aunque sea el mismo repartidor', () => {
    const filas = liquidacionDesdeOrdenes([
      orden({ fecha_operativa: '2026-08-12' }),
      orden({ fecha_operativa: '2026-08-13' }),
    ])
    expect(filas).toHaveLength(2)
  })

  it('deja fuera las órdenes sin repartidor: no se le pagan a nadie', () => {
    const filas = liquidacionDesdeOrdenes([orden(), orden({ repartidor_id: null, repartidor: null })])
    expect(filas).toHaveLength(1)
    expect(filas[0].carreras).toBe(1)
  })

  it('no le paga a nadie por una orden anulada', () => {
    const filas = liquidacionDesdeOrdenes([orden(), orden({ estado: 'anulada' })])
    expect(filas[0].carreras).toBe(1)
  })

  it('calcula el margen entre lo cobrado y lo pagado', () => {
    const filas = liquidacionDesdeOrdenes([orden({ tarifa_cliente_usd: 3, pago_repartidor_usd: 2 })])
    expect(filas[0].total_cobrado_usd).toBe(3)
    expect(filas[0].total_pagar_usd).toBe(2)
    expect(filas[0].margen_usd).toBe(1)
  })

  it('devuelve vacío si no hay órdenes', () => {
    expect(liquidacionDesdeOrdenes([])).toEqual([])
  })
})

describe('carrerasPorMoneda', () => {
  const enBolivares = orden({ pagado_divisa_usd: 0, pagado_bs: 480 })
  const enDolares = orden({ pagado_divisa_usd: 12, pagado_bs: 0 })
  const mixta = orden({ pagado_divisa_usd: 5, pagado_bs: 280 })
  const sinPago = orden({ pagado_divisa_usd: 0, pagado_bs: 0 })

  it('separa las carreras según con qué plata se cobraron', () => {
    const conteo = carrerasPorMoneda([enBolivares, enDolares, enDolares, mixta])
    expect(conteo.BS).toBe(1)
    expect(conteo.USD).toBe(2)
    expect(conteo.MIXTO).toBe(1)
  })

  it('no fuerza a una sola moneda la que se cobró mezclada', () => {
    // Parte en efectivo y parte por pago móvil: meterla en cualquiera de las
    // dos columnas descuadraría el efectivo que hay en la caja.
    expect(carrerasPorMoneda([mixta]).MIXTO).toBe(1)
    expect(carrerasPorMoneda([mixta]).USD).toBe(0)
    expect(carrerasPorMoneda([mixta]).BS).toBe(0)
  })

  it('cuenta aparte la que no tiene pago cargado', () => {
    expect(carrerasPorMoneda([sinPago]).SIN_PAGO).toBe(1)
  })

  it('resume en una línea omitiendo lo que no ocurrió', () => {
    expect(resumenMonedas([enDolares, enDolares, enBolivares])).toBe('2 en dólares · 1 en bolívares')
  })

  it('separa en dólares cuánto hay que pagar por cada moneda de cobro', () => {
    // El pago al repartidor está tarifado en dólares aunque el cliente haya
    // pagado en bolívares: lo que cambia es de qué caja sale la plata.
    const pagar = pagoPorMoneda([
      orden({ pagado_divisa_usd: 12, pagado_bs: 0, pago_repartidor_usd: 1.5 }),
      orden({ pagado_divisa_usd: 12, pagado_bs: 0, pago_repartidor_usd: 2.5 }),
      orden({ pagado_divisa_usd: 0, pagado_bs: 480, pago_repartidor_usd: 3 }),
    ])
    expect(pagar.USD).toBe(4)
    expect(pagar.BS).toBe(3)
    expect(pagar.MIXTO).toBe(0)
  })

  it('no mete la mixta en ninguna de las dos columnas', () => {
    const pagar = pagoPorMoneda([orden({ pagado_divisa_usd: 5, pagado_bs: 280, pago_repartidor_usd: 2 })])
    expect(pagar.MIXTO).toBe(2)
    expect(pagar.USD).toBe(0)
    expect(pagar.BS).toBe(0)
  })

  it('lo separado por moneda suma el total a pagar', () => {
    const ordenes = [
      orden({ pagado_divisa_usd: 12, pagado_bs: 0, pago_repartidor_usd: 1.5 }),
      orden({ pagado_divisa_usd: 0, pagado_bs: 480, pago_repartidor_usd: 3 }),
      orden({ pagado_divisa_usd: 5, pagado_bs: 280, pago_repartidor_usd: 2 }),
      orden({ pagado_divisa_usd: 0, pagado_bs: 0, pago_repartidor_usd: 1 }),
    ]
    const pagar = pagoPorMoneda(ordenes)
    const total = ordenes.reduce((suma, o) => suma + o.pago_repartidor_usd, 0)
    expect(pagar.USD + pagar.BS + pagar.MIXTO + pagar.SIN_PAGO).toBeCloseTo(total, 2)
  })

  it('devuelve todo en cero sin órdenes', () => {
    expect(carrerasPorMoneda([])).toEqual({ USD: 0, BS: 0, MIXTO: 0, SIN_PAGO: 0, FACTURADA: 0 })
    expect(pagoPorMoneda([])).toEqual({ USD: 0, BS: 0, MIXTO: 0, SIN_PAGO: 0, FACTURADA: 0 })
  })
})

describe('hayMargenDeDelivery', () => {
  function fila(margen: number): LiquidacionRepartidor {
    return {
      fecha_operativa: '2026-08-12',
      repartidor_id: 'rep-1',
      repartidor: 'Luis',
      carreras: 3,
      total_pagar_usd: 6 - margen,
      total_cobrado_usd: 6,
      margen_usd: margen,
    }
  }

  it('no ve margen cuando al repartidor se le paga el delivery completo', () => {
    // Es el esquema actual del local: cobra $4, le paga $4.
    expect(hayMargenDeDelivery([fila(0), fila(0)])).toBe(false)
  })

  it('ve margen en cuanto alguna zona deja diferencia', () => {
    expect(hayMargenDeDelivery([fila(0), fila(1.5)])).toBe(true)
  })

  it('ignora los centavos sueltos del redondeo', () => {
    expect(hayMargenDeDelivery([fila(0.004)])).toBe(false)
  })

  it('no ve margen si no hay filas', () => {
    expect(hayMargenDeDelivery([])).toBe(false)
  })
})

describe('consolidarLiquidacion', () => {
  function fila(parcial: Partial<LiquidacionRepartidor> = {}): LiquidacionRepartidor {
    return {
      fecha_operativa: '2026-08-12',
      repartidor_id: 'rep-1',
      repartidor: 'Luis',
      carreras: 3,
      total_pagar_usd: 4.5,
      total_cobrado_usd: 6,
      margen_usd: 1.5,
      ...parcial,
    }
  }

  it('junta los días del rango en una sola fila por repartidor', () => {
    const consolidado = consolidarLiquidacion([
      fila({ fecha_operativa: '2026-08-12', carreras: 3, total_pagar_usd: 4.5 }),
      fila({ fecha_operativa: '2026-08-13', carreras: 2, total_pagar_usd: 3 }),
    ])

    expect(consolidado).toHaveLength(1)
    expect(consolidado[0].carreras).toBe(5)
    expect(consolidado[0].total_pagar_usd).toBe(7.5)
  })

  it('mantiene separados a los distintos repartidores', () => {
    const consolidado = consolidarLiquidacion([
      fila({ repartidor_id: 'rep-1', repartidor: 'Luis' }),
      fila({ repartidor_id: 'rep-2', repartidor: 'Ana' }),
    ])
    expect(consolidado).toHaveLength(2)
  })

  it('ordena alfabéticamente para que el cuadro salga siempre igual', () => {
    const consolidado = consolidarLiquidacion([
      fila({ repartidor_id: 'rep-1', repartidor: 'Luis' }),
      fila({ repartidor_id: 'rep-2', repartidor: 'Ana' }),
      fila({ repartidor_id: 'rep-3', repartidor: 'Óscar' }),
    ])
    expect(consolidado.map((f) => f.repartidor)).toEqual(['Ana', 'Luis', 'Óscar'])
  })

  it('no modifica las filas que recibe', () => {
    const original = fila({ carreras: 3 })
    consolidarLiquidacion([original, fila({ fecha_operativa: '2026-08-13' })])
    expect(original.carreras).toBe(3)
  })
})

describe('comandas facturadas aparte', () => {
  const facturada = orden({ facturada_aparte: true, pagado_divisa_usd: 0, pagado_bs: 0, pago_repartidor_usd: 3 })
  const normal = orden({ pagado_divisa_usd: 0, pagado_bs: 480, pago_repartidor_usd: 2 })

  it('no se cuenta como una carrera «sin pago»', () => {
    // Sí se cobró; lo que pasa es que fue por la otra caja. Meterla entre las
    // sin pago haría creer que quedó algo por cobrar.
    const conteo = carrerasPorMoneda([facturada, normal])
    expect(conteo.FACTURADA).toBe(1)
    expect(conteo.SIN_PAGO).toBe(0)
    expect(conteo.BS).toBe(1)
  })

  it('su carrera no se mezcla con la plata de la caja', () => {
    const pagar = pagoPorMoneda([facturada, normal])
    expect(pagar.FACTURADA).toBe(3)
    expect(pagar.BS).toBe(2)
    expect(pagar.USD).toBe(0)
  })

  it('igual se le paga al repartidor que la llevó', () => {
    // Es lo único que esta comanda aporta: la carrera.
    const filas = liquidacionDesdeOrdenes([facturada])
    expect(filas).toHaveLength(1)
    expect(filas[0].carreras).toBe(1)
    expect(filas[0].total_pagar_usd).toBe(3)
  })

  it('se nombra aparte en el resumen de una línea', () => {
    expect(resumenMonedas([facturada])).toBe('1 en facturada aparte')
  })
})
