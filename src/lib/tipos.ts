export type RolUsuario = 'cajera' | 'admin' | 'dueno'
export type EstadoOrden = 'pendiente' | 'verificada' | 'anulada'

/** Cómo llega el pedido al cliente. */
export type TipoOrden = 'delivery' | 'pickup'
export type Moneda = 'BS' | 'USD'

export type MetodoPago =
  | 'pago_movil'
  | 'transferencia'
  | 'efectivo_bs'
  | 'efectivo_usd'
  | 'zelle'
  | 'binance'
  | 'punto_venta'

export interface Usuario {
  id: string
  nombre: string
  /** Con lo que entra a la app. Es la parte del correo antes de la arroba. */
  usuario: string | null
  rol: RolUsuario
  activo: boolean
  creado_en: string
}

export interface Zona {
  id: string
  nombre: string
  tarifa_cliente_usd: number
  pago_repartidor_usd: number
  orden: number
  activo: boolean
}

export interface Repartidor {
  id: string
  nombre: string
  telefono: string | null
  activo: boolean
}

export interface Banco {
  id: string
  nombre: string
  codigo: string | null
  activo: boolean
  orden: number
}

/** Cuenta propia del local: dónde cae la plata (la columna "BANCO" del papel). */
export interface Cuenta {
  id: string
  nombre: string
  abreviatura: string
  banco_id: string | null
  telefono_pago_movil: string | null
  numero: string | null
  activo: boolean
  orden: number
}

export interface TasaCambio {
  fecha: string
  bs_por_usd: number
  cargada_por: string | null
  cargada_en: string
}

export interface Orden {
  id: string
  fecha_operativa: string
  numero_factura: string
  tipo: TipoOrden
  cliente_nombre: string
  cliente_telefono: string | null
  direccion: string | null
  zona_id: string | null
  tarifa_cliente_usd: number
  pago_repartidor_usd: number
  repartidor_id: string | null
  monto_pedido_usd: number
  tasa_bs_por_usd: number
  estado: EstadoOrden
  motivo_anulacion: string | null
  notas: string | null
  verificada_por: string | null
  verificada_en: string | null
  creada_por: string
  creada_en: string
  actualizada_en: string
}

export interface Pago {
  id: string
  orden_id: string
  metodo: MetodoPago
  cuenta_id: string | null
  banco_id: string | null
  referencia: string | null
  emisor: string | null
  monto: number
  moneda: Moneda
  imagen_path: string | null
  creado_en: string
}

/** Fila de `v_ordenes_detalle`: la orden con sus totales ya calculados en SQL. */
export interface OrdenDetalle {
  id: string
  fecha_operativa: string
  numero_factura: string
  tipo: TipoOrden
  cliente_nombre: string
  cliente_telefono: string | null
  direccion: string | null
  zona: string
  tarifa_cliente_usd: number
  pago_repartidor_usd: number
  margen_delivery_usd: number
  repartidor: string | null
  repartidor_id: string | null
  monto_pedido_usd: number
  total_usd: number
  tasa_bs_por_usd: number
  estado: EstadoOrden
  notas: string | null
  cargada_por: string | null
  creada_en: string
  pagado_usd: number
  /** Lo que entró en efectivo/divisa, tal cual: sin convertir. */
  pagado_divisa_usd: number
  /** Lo que entró en bolívares, tal cual: sin convertir. */
  pagado_bs: number
  diferencia_usd: number
  cantidad_pagos: number
}

/** Con qué plata se cobró una carrera. */
export type MonedaCobro = 'USD' | 'BS' | 'MIXTO' | 'SIN_PAGO'

export const ETIQUETA_MONEDA_COBRO: Record<MonedaCobro, string> = {
  USD: 'Dólares',
  BS: 'Bolívares',
  MIXTO: 'Mixto',
  SIN_PAGO: 'Sin pago',
}

/** Fila de `v_liquidacion_repartidores`: el cuadro que hoy se arma a mano. */
export interface LiquidacionRepartidor {
  fecha_operativa: string
  repartidor_id: string
  repartidor: string
  carreras: number
  total_pagar_usd: number
  total_cobrado_usd: number
  margen_usd: number
}

export interface Cierre {
  fecha_operativa: string
  cerrado_por: string
  cerrado_en: string
  totales: TotalesCierre
  notas: string | null
}

export interface TotalesCierre {
  ordenes: number
  ventas_usd: number
  delivery_cobrado_usd: number
  delivery_pagado_usd: number
  margen_delivery_usd: number
  total_usd: number
  por_metodo: Record<string, { cantidad: number; monto_bs: number; monto_usd: number }>
}

/** Un pago tal como se está tecleando en el formulario, antes de guardarse. */
export interface BorradorPago {
  clave: string
  metodo: MetodoPago
  cuenta_id: string | null
  banco_id: string | null
  referencia: string
  emisor: string
  monto: string
  moneda: Moneda
  archivo?: File
  imagen_path?: string | null
}

export const ETIQUETA_METODO: Record<MetodoPago, string> = {
  pago_movil: 'Pago móvil',
  transferencia: 'Transferencia',
  efectivo_bs: 'Efectivo Bs',
  efectivo_usd: 'Efectivo $',
  zelle: 'Zelle',
  binance: 'Binance',
  punto_venta: 'Punto de venta',
}

export const ETIQUETA_ROL: Record<RolUsuario, string> = {
  cajera: 'Cajera',
  admin: 'Administradora',
  dueno: 'Dueño',
}

export const ETIQUETA_TIPO: Record<TipoOrden, string> = {
  delivery: 'Delivery',
  pickup: 'Pick Up',
}

/** Un pick up se paga al pasar por el local: en efectivo en dólares o pago móvil. */
export const METODOS_PICKUP: MetodoPago[] = ['efectivo_usd', 'pago_movil']

export const ETIQUETA_ESTADO: Record<EstadoOrden, string> = {
  pendiente: 'Pendiente',
  verificada: 'Verificada',
  anulada: 'Anulada',
}
