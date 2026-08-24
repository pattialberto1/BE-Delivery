import type { BorradorPago, TipoOrden } from './tipos'
import { monedaDeMetodo } from './reglas'

/**
 * Los valores en blanco de una orden y de un pago.
 *
 * Viven aparte del formulario porque los usan también las pantallas que lo
 * envuelven, y mezclar componentes con funciones sueltas en un mismo archivo
 * rompe la recarga en caliente durante el desarrollo.
 */

/** Los campos de la orden que se teclean, sin los pagos. */
export interface DatosFormulario {
  tipo: TipoOrden
  /** Se facturó por la caja del local, con factura fiscal. */
  facturada_aparte: boolean
  numero_factura: string
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  zona_id: string
  repartidor_id: string
  monto_pedido_usd: string
  notas: string
}

export function formularioVacio(): DatosFormulario {
  return {
    tipo: 'delivery',
    facturada_aparte: false,
    numero_factura: '',
    cliente_nombre: '',
    cliente_telefono: '',
    direccion: '',
    zona_id: '',
    repartidor_id: '',
    monto_pedido_usd: '',
    notas: '',
  }
}

export function pagoVacio(): BorradorPago {
  return {
    clave: crypto.randomUUID(),
    metodo: 'pago_movil',
    cuenta_id: null,
    banco_id: null,
    referencia: '',
    emisor: '',
    monto: '',
    moneda: monedaDeMetodo('pago_movil'),
  }
}
