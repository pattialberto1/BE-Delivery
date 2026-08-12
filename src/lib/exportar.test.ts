import { describe, expect, it } from 'vitest'
import { consolidarLiquidacion, hayMargenDeDelivery, liquidacionDesdeOrdenes } from './exportar'
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
    diferencia_usd: 0,
    cantidad_pagos: 1,
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
