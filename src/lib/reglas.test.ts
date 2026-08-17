import { describe, expect, it } from 'vitest'
import {
  aNumero,
  buscarPorNombre,
  calcularResumen,
  detectarSaltosDeFactura,
  fuerzaDeDuplicado,
  normalizarTexto,
  referenciaEsConfiable,
  fechaOperativa,
  metodoParaCompletar,
  monedaDeMetodo,
  normalizarReferencia,
  pagoEnUSD,
  referenciasCoinciden,
  requiereCuenta,
  requiereCaptura,
  requiereReferencia,
  tieneErrores,
  totalPagadoUSD,
  validarOrden,
  type DatosOrdenAValidar,
} from './reglas'
import type { BorradorPago, MetodoPago } from './tipos'

function pago(parcial: Partial<BorradorPago> = {}): BorradorPago {
  return {
    clave: Math.random().toString(36).slice(2),
    metodo: 'pago_movil',
    cuenta_id: 'cuenta-1',
    banco_id: null,
    referencia: '123456789',
    emisor: '04141234567',
    monto: '100',
    moneda: 'BS',
    archivo: new File([''], 'captura.jpg', { type: 'image/jpeg' }),
    ...parcial,
  }
}

function orden(parcial: Partial<DatosOrdenAValidar> = {}): DatosOrdenAValidar {
  return {
    tipo: 'delivery',
    numero_factura: '1001',
    cliente_nombre: 'María',
    direccion: 'Av. Urdaneta, edificio X',
    zona_id: 'zona-1',
    repartidor_id: 'repartidor-1',
    monto_pedido_usd: '10',
    tarifa_cliente_usd: 2,
    tasa_bs_por_usd: 40,
    pagos: [pago({ monto: '480' })], // 12 USD exactos a tasa 40
    ...parcial,
  }
}

describe('aNumero', () => {
  it('acepta la coma decimal, que es como se teclea aquí', () => {
    expect(aNumero('36,50')).toBe(36.5)
    expect(aNumero('1234,05')).toBe(1234.05)
  })

  it('acepta el punto decimal', () => {
    expect(aNumero('36.50')).toBe(36.5)
  })

  it('ignora espacios sueltos', () => {
    expect(aNumero(' 12 ')).toBe(12)
  })

  it('devuelve NaN con texto que no es número', () => {
    expect(aNumero('abc')).toBeNaN()
    expect(aNumero('')).toBeNaN()
  })
})

describe('normalizarReferencia', () => {
  it('descarta todo lo que no sea dígito', () => {
    expect(normalizarReferencia('Ref: 0012-3456')).toBe('123456')
  })

  it('quita los ceros a la izquierda', () => {
    expect(normalizarReferencia('0000123')).toBe('123')
  })

  it('no vacía una referencia que es toda ceros', () => {
    expect(normalizarReferencia('0000')).toBe('0000')
  })
})

describe('referenciasCoinciden', () => {
  it('reconoce la misma referencia escrita distinto', () => {
    expect(referenciasCoinciden('0012-3456', 'Ref 123456')).toBe(true)
  })

  it('reconoce el recorte del papel contra la referencia completa', () => {
    // En la hoja se anotan los últimos 4 dígitos; en la app se puede teclear
    // la referencia entera. Las dos formas tienen que cruzarse.
    expect(referenciasCoinciden('00123459319', '9319')).toBe(true)
  })

  it('cruza igual sin importar cuál de las dos venga completa', () => {
    expect(referenciasCoinciden('9319', '00123459319')).toBe(true)
    expect(referenciasCoinciden('987654321', '54321')).toBe(true)
  })

  it('no cruza referencias distintas', () => {
    expect(referenciasCoinciden('123456789', '987654321')).toBe(false)
  })

  it('no da falsos positivos con sufijos demasiado cortos', () => {
    // "21" coincide al final de ambas, pero con 2 dígitos cualquier par de
    // referencias chocaría. Se exigen al menos 4.
    expect(referenciasCoinciden('111121', '999921')).toBe(false)
  })

  it('ignora referencias vacías', () => {
    expect(referenciasCoinciden('', '123456')).toBe(false)
  })
})

describe('reglas por forma de pago', () => {
  it('no le pide referencia ni captura al efectivo', () => {
    for (const metodo of ['efectivo_bs', 'efectivo_usd'] as MetodoPago[]) {
      expect(requiereReferencia(metodo)).toBe(false)
      expect(requiereCaptura(metodo)).toBe(false)
      expect(requiereCuenta(metodo)).toBe(false)
    }
  })

  it('le pide la cuenta receptora al pago móvil y a la transferencia', () => {
    expect(requiereCuenta('pago_movil')).toBe(true)
    expect(requiereCuenta('transferencia')).toBe(true)
    expect(requiereCuenta('zelle')).toBe(false)
  })

  it('asigna la moneda que corresponde a cada método', () => {
    expect(monedaDeMetodo('pago_movil')).toBe('BS')
    expect(monedaDeMetodo('zelle')).toBe('USD')
    expect(monedaDeMetodo('efectivo_usd')).toBe('USD')
    expect(monedaDeMetodo('efectivo_bs')).toBe('BS')
  })
})

describe('conversión de pagos', () => {
  it('convierte bolívares a dólares con la tasa', () => {
    expect(pagoEnUSD(400, 'BS', 40)).toBe(10)
  })

  it('deja los dólares como están', () => {
    expect(pagoEnUSD(10, 'USD', 40)).toBe(10)
  })

  it('no explota si falta la tasa', () => {
    expect(pagoEnUSD(400, 'BS', 0)).toBe(0)
  })

  it('suma pagos mixtos de distinta moneda', () => {
    const pagos = [pago({ monto: '200', moneda: 'BS' }), pago({ monto: '5', moneda: 'USD' })]
    expect(totalPagadoUSD(pagos, 40)).toBe(10) // 200/40 + 5
  })
})

describe('calcularResumen', () => {
  it('suma el delivery al pedido', () => {
    const resumen = calcularResumen(orden({ monto_pedido_usd: '10', tarifa_cliente_usd: 2.5 }))
    expect(resumen.total).toBe(12.5)
  })

  it('marca que cuadra cuando lo pagado da el total', () => {
    expect(calcularResumen(orden()).cuadra).toBe(true)
  })

  it('detecta cuando falta plata', () => {
    const resumen = calcularResumen(orden({ pagos: [pago({ monto: '400' })] })) // 10 de 12
    expect(resumen.cuadra).toBe(false)
    expect(resumen.diferencia).toBeCloseTo(-2)
  })

  it('tolera los centavos que deja el redondeo de la tasa', () => {
    // 479,60 Bs a tasa 40 = 11,99 USD contra 12 esperados.
    const resumen = calcularResumen(orden({ pagos: [pago({ monto: '479,60' })] }))
    expect(resumen.cuadra).toBe(true)
  })
})

describe('validarOrden', () => {
  it('deja pasar una orden completa', () => {
    const problemas = validarOrden(orden())
    expect(tieneErrores(problemas)).toBe(false)
  })

  it('exige los datos mínimos', () => {
    const problemas = validarOrden(
      orden({ numero_factura: '', cliente_nombre: '', zona_id: '' }),
    )
    const campos = problemas.filter((p) => p.nivel === 'error').map((p) => p.campo)
    expect(campos).toContain('numero_factura')
    expect(campos).toContain('cliente_nombre')
    expect(campos).toContain('zona_id')
  })

  it('no exige la dirección: muchos clientes mandan el location', () => {
    expect(tieneErrores(validarOrden(orden({ direccion: '' })))).toBe(false)
  })

  it('bloquea si no hay tasa del día', () => {
    const problemas = validarOrden(orden({ tasa_bs_por_usd: 0 }))
    expect(problemas.some((p) => p.campo === 'tasa' && p.nivel === 'error')).toBe(true)
  })

  it('bloquea si no hay ningún pago', () => {
    const problemas = validarOrden(orden({ pagos: [] }))
    expect(problemas.some((p) => p.campo === 'pagos' && p.nivel === 'error')).toBe(true)
  })

  it('exige referencia al pago móvil', () => {
    const problemas = validarOrden(orden({ pagos: [pago({ referencia: '', monto: '480' })] }))
    expect(problemas.some((p) => p.campo.endsWith('.referencia') && p.nivel === 'error')).toBe(true)
  })

  it('no exige referencia al efectivo', () => {
    const problemas = validarOrden(
      orden({ pagos: [pago({ metodo: 'efectivo_usd', moneda: 'USD', monto: '12', referencia: '', cuenta_id: null, banco_id: null })] }),
    )
    expect(tieneErrores(problemas)).toBe(false)
  })

  it('bloquea la misma referencia con el mismo monto dentro de la orden', () => {
    const problemas = validarOrden(
      orden({ pagos: [pago({ referencia: '123456', monto: '240' }), pago({ referencia: '0123456', monto: '240' })] }),
    )
    expect(problemas.some((p) => p.mensaje.includes('ya están en esta misma orden') && p.nivel === 'error')).toBe(true)
  })

  it('solo avisa si la referencia corta se repite pero con otro monto', () => {
    // Con 4 dígitos, dos pagos distintos pueden compartir los mismos números.
    const problemas = validarOrden(
      orden({ pagos: [pago({ referencia: '9319', monto: '240' }), pago({ referencia: '9319', monto: '300' })] }),
    )
    const choque = problemas.find((p) => p.mensaje.includes('coincide la referencia'))
    expect(choque?.nivel).toBe('aviso')
    expect(tieneErrores(problemas)).toBe(false)
  })

  it('exige saber en qué cuenta nuestra entró el pago móvil', () => {
    const problemas = validarOrden(orden({ pagos: [pago({ cuenta_id: null, monto: '480' })] }))
    expect(problemas.some((p) => p.campo.endsWith('.cuenta_id') && p.nivel === 'error')).toBe(true)
  })

  it('avisa del descuadre sin bloquear el guardado', () => {
    const problemas = validarOrden(orden({ pagos: [pago({ monto: '400' })] }))
    const descuadre = problemas.find((p) => p.mensaje.includes('Faltan'))
    expect(descuadre?.nivel).toBe('aviso')
    expect(tieneErrores(problemas)).toBe(false)
  })

  it('deja guardar sin repartidor, porque al armar la comanda no se sabe quién la lleva', () => {
    // Se avisa, pero no tranca: el sistema lo exige al cerrar el día, que es
    // cuando de verdad importa.
    const problemas = validarOrden(orden({ repartidor_id: null }))
    expect(problemas.find((p) => p.campo === 'repartidor_id')?.nivel).toBe('aviso')
    expect(tieneErrores(problemas)).toBe(false)
  })

  it('avisa cuando falta la captura pero deja guardar', () => {
    const problemas = validarOrden(orden({ pagos: [pago({ archivo: undefined, monto: '480' })] }))
    expect(problemas.find((p) => p.campo.endsWith('.archivo'))?.nivel).toBe('aviso')
    expect(tieneErrores(problemas)).toBe(false)
  })

  it('rechaza un monto de pedido negativo', () => {
    const problemas = validarOrden(orden({ monto_pedido_usd: '-5' }))
    expect(problemas.some((p) => p.campo === 'monto_pedido_usd' && p.nivel === 'error')).toBe(true)
  })
})

describe('completar un pago mixto', () => {
  it('si ya entró algo en bolívares, propone dólares en efectivo', () => {
    // Es el caso de todos los días: manda el pago móvil y trae el resto en
    // efectivo cuando llega el pedido.
    expect(metodoParaCompletar([pago({ moneda: 'BS' })])).toBe('efectivo_usd')
  })

  it('si ya entró en dólares, propone pago móvil', () => {
    expect(metodoParaCompletar([pago({ metodo: 'efectivo_usd', moneda: 'USD' })])).toBe('pago_movil')
  })

  it('con pagos mixtos ya cargados, sigue proponiendo dólares', () => {
    const mezcla = [pago({ moneda: 'BS' }), pago({ metodo: 'efectivo_usd', moneda: 'USD' })]
    expect(metodoParaCompletar(mezcla)).toBe('efectivo_usd')
  })

  it('sin ningún pago cargado, propone pago móvil', () => {
    expect(metodoParaCompletar([])).toBe('pago_movil')
  })
})

describe('confianza de las referencias', () => {
  it('trata como poco confiable el recorte de 4 dígitos del papel', () => {
    expect(referenciaEsConfiable('9319')).toBe(false)
    expect(referenciaEsConfiable('123456')).toBe(false)
  })

  it('confía en la referencia completa, de 8 dígitos o más', () => {
    expect(referenciaEsConfiable('12345678')).toBe(true)
    expect(referenciaEsConfiable('0012-3456-78')).toBe(true)
  })

  it('con referencia corta, el monto igual delata la captura reenviada', () => {
    expect(fuerzaDeDuplicado('9319', 24460, 24460)).toBe('seguro')
  })

  it('con referencia corta y monto distinto, la coincidencia puede ser casual', () => {
    expect(fuerzaDeDuplicado('9319', 24460, 12995)).toBe('posible')
  })

  it('con referencia larga, la repetición basta sin mirar el monto', () => {
    expect(fuerzaDeDuplicado('123456789', 100, 999)).toBe('seguro')
  })

  it('no tropieza con los centavos del redondeo', () => {
    expect(fuerzaDeDuplicado('9319', 24460.0, 24460.004)).toBe('seguro')
  })
})

describe('normalizarTexto', () => {
  it('quita tildes y la ñ', () => {
    expect(normalizarTexto('Peñón')).toBe('penon')
    expect(normalizarTexto('El Paraíso')).toBe('el paraiso')
    expect(normalizarTexto('Montalbán')).toBe('montalban')
  })

  it('pasa todo a minúsculas y recorta los bordes', () => {
    expect(normalizarTexto('  CHACAO  ')).toBe('chacao')
  })
})

describe('buscarPorNombre', () => {
  const zonas = [
    { nombre: 'Chacao' },
    { nombre: 'La Charneca' },
    { nombre: 'Peñón' },
    { nombre: 'El Paraíso' },
    { nombre: 'La Bandera' },
    { nombre: 'Plaza Venezuela' },
  ]

  it('encuentra sin exigir tildes ni la ñ', () => {
    expect(buscarPorNombre(zonas, 'penon').map((z) => z.nombre)).toEqual(['Peñón'])
    expect(buscarPorNombre(zonas, 'paraiso').map((z) => z.nombre)).toEqual(['El Paraíso'])
  })

  it('busca por cualquier parte del nombre', () => {
    expect(buscarPorNombre(zonas, 'charneca').map((z) => z.nombre)).toEqual(['La Charneca'])
  })

  it('ignora mayúsculas', () => {
    expect(buscarPorNombre(zonas, 'CHACAO').map((z) => z.nombre)).toEqual(['Chacao'])
  })

  it('pone primero las que empiezan con lo tecleado', () => {
    // "La Bandera" y "La Charneca" empiezan con "la"; "Plaza Venezuela" lo
    // tiene más adelante, así que va al final.
    const nombres = buscarPorNombre(zonas, 'la').map((z) => z.nombre)
    expect(nombres).toEqual(['La Bandera', 'La Charneca', 'Plaza Venezuela'])
  })

  it('devuelve todo cuando no se ha tecleado nada', () => {
    expect(buscarPorNombre(zonas, '')).toHaveLength(zonas.length)
    expect(buscarPorNombre(zonas, '   ')).toHaveLength(zonas.length)
  })

  it('devuelve vacío si nada coincide', () => {
    expect(buscarPorNombre(zonas, 'zzz')).toEqual([])
  })
})

describe('pick up (pick up)', () => {
  function pickup(parcial: Partial<DatosOrdenAValidar> = {}): DatosOrdenAValidar {
    return orden({
      tipo: 'pickup',
      zona_id: '',
      repartidor_id: null,
      tarifa_cliente_usd: 0,
      direccion: '',
      monto_pedido_usd: '12',
      pagos: [pago({ metodo: 'efectivo_usd', moneda: 'USD', monto: '12', referencia: '', cuenta_id: null })],
      ...parcial,
    })
  }

  it('no pide zona ni repartidor', () => {
    expect(tieneErrores(validarOrden(pickup()))).toBe(false)
  })

  it('no cobra delivery aunque venga una tarifa', () => {
    // Si alguien cambia de delivery a pick up con la zona ya elegida, la
    // tarifa que quedó en el formulario no se puede colar en el total.
    const resumen = calcularResumen(pickup({ tarifa_cliente_usd: 4 }))
    expect(resumen.tarifaDelivery).toBe(0)
    expect(resumen.total).toBe(12)
  })

  it('sigue exigiendo cliente, factura y pago', () => {
    const problemas = validarOrden(pickup({ numero_factura: '', cliente_nombre: '', pagos: [] }))
    const campos = problemas.filter((p) => p.nivel === 'error').map((p) => p.campo)
    expect(campos).toContain('numero_factura')
    expect(campos).toContain('cliente_nombre')
    expect(campos).toContain('pagos')
  })

  it('acepta el pago móvil, que es la otra forma admitida', () => {
    const problemas = validarOrden(
      pickup({ pagos: [pago({ metodo: 'pago_movil', moneda: 'BS', monto: '480' })] }),
    )
    expect(tieneErrores(problemas)).toBe(false)
  })
})

describe('detectarSaltosDeFactura', () => {
  it('encuentra los números que faltan', () => {
    expect(detectarSaltosDeFactura(['1001', '1002', '1005'])).toEqual([1003, 1004])
  })

  it('no reporta nada cuando el correlativo está completo', () => {
    expect(detectarSaltosDeFactura(['1001', '1002', '1003'])).toEqual([])
  })

  it('no se confunde con el orden en que llegan', () => {
    expect(detectarSaltosDeFactura(['1005', '1001', '1003'])).toEqual([1002, 1004])
  })

  it('ignora facturas con letras en vez de inventar huecos', () => {
    expect(detectarSaltosDeFactura(['A-1', 'B-2'])).toEqual([])
  })

  it('se calla ante un rango disparatado por un dígito de más', () => {
    // Alguien tecleó 100100 en vez de 1001: reportar 99 mil faltantes no ayuda.
    expect(detectarSaltosDeFactura(['1001', '100100'])).toEqual([])
  })

  it('no reporta nada con una sola factura', () => {
    expect(detectarSaltosDeFactura(['1001'])).toEqual([])
  })
})

describe('fechaOperativa', () => {
  it('cuenta la madrugada como parte de la jornada anterior', () => {
    // 1 a.m. del día 15, con corte a las 5: pertenece al 14.
    expect(fechaOperativa(new Date(2026, 7, 15, 1, 0), 5)).toBe('2026-08-14')
  })

  it('cuenta la tarde como el día en curso', () => {
    expect(fechaOperativa(new Date(2026, 7, 15, 20, 0), 5)).toBe('2026-08-15')
  })

  it('cambia de jornada justo en la hora de corte', () => {
    expect(fechaOperativa(new Date(2026, 7, 15, 5, 0), 5)).toBe('2026-08-15')
    expect(fechaOperativa(new Date(2026, 7, 15, 4, 59), 5)).toBe('2026-08-14')
  })

  it('retrocede bien al cruzar el cambio de mes', () => {
    expect(fechaOperativa(new Date(2026, 8, 1, 2, 0), 5)).toBe('2026-08-31')
  })
})
