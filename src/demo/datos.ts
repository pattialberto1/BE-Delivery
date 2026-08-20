/**
 * Datos de la demo.
 *
 * Recrean una jornada real: las mismas facturas de la hoja que se llena a mano
 * (45361 a 45365) más algunas agregadas para que se vean los avisos que la app
 * levanta y que en el papel no se notan.
 *
 * Nada de esto toca la base de datos: vive en memoria y se pierde al recargar.
 */

import { fechaOperativa } from '../lib/reglas'
import type { Banco, Cierre, Cuenta, Orden, Pago, Repartidor, Usuario } from '../lib/tipos'

export { ZONAS_DEMO } from './zonas'

/** La demo siempre trabaja sobre "hoy" para que el cierre y la liquidación tengan datos. */
export const HOY = fechaOperativa(new Date(), 5)

export const TASA_DEMO = 764.36

export const USUARIOS_DEMO: Usuario[] = [
  { id: 'u-admin', nombre: 'Yulimar', usuario: 'yulimar', rol: 'admin', activo: true, creado_en: '2026-01-01T00:00:00Z' },
  { id: 'u-cajera', nombre: 'Génesis', usuario: 'genesis', rol: 'cajera', activo: true, creado_en: '2026-01-01T00:00:00Z' },
  { id: 'u-dueno', nombre: 'Alberto', usuario: 'alberto', rol: 'dueno', activo: true, creado_en: '2026-01-01T00:00:00Z' },
]

export const REPARTIDORES_DEMO: Repartidor[] = [
  { id: 'r1', nombre: 'Maxi', telefono: '0412-1112233', activo: true },
  { id: 'r2', nombre: 'Santiago', telefono: '0414-4445566', activo: true },
  { id: 'r3', nombre: 'Jhonny', telefono: null, activo: true },
]

export const CUENTAS_DEMO: Cuenta[] = [
  {
    id: 'c-bp',
    nombre: 'Banco Plaza',
    abreviatura: 'BP',
    banco_id: 'b-plaza',
    telefono_pago_movil: '0412-2346408',
    numero: null,
    activo: true,
    orden: 1,
  },
  {
    id: 'c-bb',
    nombre: 'Bicentenario',
    abreviatura: 'BB',
    banco_id: 'b-bicentenario',
    telefono_pago_movil: null,
    numero: null,
    activo: true,
    orden: 2,
  },
]

export const BANCOS_DEMO: Banco[] = [
  { id: 'b-banesco', nombre: 'Banesco', codigo: '0134', activo: true, orden: 1 },
  { id: 'b-venezuela', nombre: 'Banco de Venezuela', codigo: '0102', activo: true, orden: 2 },
  { id: 'b-mercantil', nombre: 'Mercantil', codigo: '0105', activo: true, orden: 3 },
  { id: 'b-provincial', nombre: 'Provincial (BBVA)', codigo: '0108', activo: true, orden: 4 },
  { id: 'b-bnc', nombre: 'Banco Nacional de Crédito (BNC)', codigo: '0191', activo: true, orden: 5 },
  { id: 'b-plaza', nombre: 'Banco Plaza', codigo: '0138', activo: true, orden: 12 },
  { id: 'b-bicentenario', nombre: 'Bicentenario', codigo: '0175', activo: true, orden: 20 },
]

/** Una captura de pago móvil de mentira, dibujada aquí mismo para no cargar archivos. */
export const CAPTURA_FALSA = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="380" height="620" viewBox="0 0 380 620">
  <rect width="380" height="620" fill="#f1f5f9"/>
  <rect x="0" y="0" width="380" height="90" fill="#1e3a5f"/>
  <text x="24" y="40" font-family="system-ui" font-size="17" font-weight="bold" fill="#fff">Banco</text>
  <text x="24" y="66" font-family="system-ui" font-size="13" fill="#cbd5e1">Pago móvil</text>
  <circle cx="190" cy="150" r="34" fill="#16a34a"/>
  <path d="M174 150 l11 11 l21 -22" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>
  <text x="190" y="216" text-anchor="middle" font-family="system-ui" font-size="17" font-weight="bold" fill="#0f172a">Operación exitosa</text>
  <g font-family="system-ui" font-size="13" fill="#64748b">
    <text x="30" y="270">Monto</text><text x="350" y="270" text-anchor="end" font-size="15" font-weight="bold" fill="#0f172a">Bs 24.460,00</text>
    <text x="30" y="312">Referencia</text><text x="350" y="312" text-anchor="end" font-size="15" font-weight="bold" fill="#0f172a">002134559319</text>
    <text x="30" y="354">Destino</text><text x="350" y="354" text-anchor="end" font-size="14" fill="#0f172a">0412-2346408</text>
    <text x="30" y="396">Banco destino</text><text x="350" y="396" text-anchor="end" font-size="14" fill="#0f172a">0138 Plaza</text>
    <text x="30" y="438">Origen</text><text x="350" y="438" text-anchor="end" font-size="14" fill="#0f172a">0414-1234567</text>
    <text x="30" y="480">Fecha</text><text x="350" y="480" text-anchor="end" font-size="14" fill="#0f172a">12/08/2026</text>
  </g>
  <line x1="30" y1="286" x2="350" y2="286" stroke="#e2e8f0"/>
  <line x1="30" y1="328" x2="350" y2="328" stroke="#e2e8f0"/>
  <line x1="30" y1="370" x2="350" y2="370" stroke="#e2e8f0"/>
  <line x1="30" y1="412" x2="350" y2="412" stroke="#e2e8f0"/>
  <line x1="30" y1="454" x2="350" y2="454" stroke="#e2e8f0"/>
  <text x="190" y="560" text-anchor="middle" font-family="system-ui" font-size="12" fill="#94a3b8">Captura de ejemplo — datos de mentira</text>
</svg>`)}`

interface SemillaOrden {
  factura: string
  tipo?: 'delivery' | 'pickup'
  cliente: string
  telefono: string
  direccion: string
  zona: string
  repartidor: string | null
  /** Monto del pedido sin el delivery. */
  pedido: number
  verificada: boolean
  /** Bolívares recibidos por pago móvil. Si se omite, se paga distinto. */
  pagoMovilBs?: number
  referencia?: string
  cuenta?: string
  /** Dólares en efectivo, la columna DIVISA del papel. */
  divisaUsd?: number
  notas?: string
}

/**
 * Las cinco facturas de la hoja más tres inventadas para que se vean los
 * avisos: una descuadrada, una sin repartidor y una con pago mixto.
 */
const SEMILLAS: SemillaOrden[] = [
  {
    factura: '45361',
    cliente: 'María Rodríguez',
    telefono: '0414-1234567',
    direccion: 'Av. Urdaneta, Edif. Centro, piso 4',
    zona: 'Urdaneta',
    repartidor: 'r1',
    pedido: 30,
    pagoMovilBs: 24460,
    referencia: '002134559319',
    cuenta: 'c-bp',
    verificada: true,
  },
  {
    factura: '45362',
    cliente: 'Luis Pérez',
    telefono: '0412-7654321',
    direccion: 'Sabana Grande, Res. El Recreo',
    zona: 'Sabana Grande',
    repartidor: 'r2',
    pedido: 33,
    pagoMovilBs: 27517,
    referencia: '9887',
    cuenta: 'c-bp',
    verificada: true,
  },
  {
    factura: '45363',
    cliente: 'Carmen Silva',
    telefono: '0416-3334455',
    direccion: 'La Candelaria, Esq. Alcabala',
    zona: 'Altagracia',
    repartidor: 'r1',
    pedido: 14,
    pagoMovilBs: 12995,
    referencia: '2486',
    cuenta: 'c-bb',
    verificada: true,
  },
  {
    factura: '45364',
    cliente: 'José Martínez',
    telefono: '0424-9998877',
    direccion: 'Bellas Artes, frente al museo',
    zona: 'Bellas Artes',
    repartidor: 'r2',
    pedido: 12,
    pagoMovilBs: 10701,
    referencia: '5924',
    cuenta: 'c-bp',
    verificada: true,
  },
  {
    factura: '45365',
    cliente: 'Ana Gómez',
    telefono: '0414-5556677',
    direccion: 'San Bernardino, Av. Vollmer',
    zona: 'San Bernardino',
    repartidor: 'r3',
    pedido: 17,
    pagoMovilBs: 14623,
    referencia: '6266',
    cuenta: 'c-bp',
    verificada: false,
  },
  // Descuadrada: el cliente mandó de menos y en el papel no se habría notado.
  {
    factura: '45366',
    cliente: 'Pedro Blanco',
    telefono: '0412-1122334',
    direccion: 'Chacao, Av. Francisco de Miranda',
    zona: 'Chacao',
    repartidor: 'r1',
    pedido: 22,
    pagoMovilBs: 15000,
    referencia: '004521887730',
    cuenta: 'c-bp',
    verificada: false,
    notas: 'El cliente dijo que mandaba el resto.',
  },
  // Sin repartidor: no se le puede liquidar a nadie y traba el cierre.
  {
    factura: '45367',
    cliente: 'Rosa Díaz',
    telefono: '0426-7778899',
    direccion: 'Catia, Av. Sucre',
    zona: 'Catia',
    repartidor: null,
    pedido: 18,
    pagoMovilBs: 16816,
    referencia: '004521990012',
    cuenta: 'c-bb',
    verificada: false,
  },
  // Pick Up: sin zona, sin delivery y sin repartidor.
  {
    factura: '45370',
    tipo: 'pickup',
    cliente: 'Daniela Ruiz',
    telefono: '0412-3334455',
    direccion: '',
    zona: '',
    repartidor: null,
    pedido: 15,
    divisaUsd: 15,
    verificada: false,
  },
  // Pago mixto: parte en efectivo en dólares (la columna DIVISA del papel).
  {
    factura: '45369',
    cliente: 'Miguel Torres',
    telefono: '0414-2223344',
    direccion: 'Altamira, Av. Luis Roche',
    zona: 'Altamira',
    repartidor: 'r3',
    pedido: 26,
    pagoMovilBs: 15287,
    referencia: '004522110455',
    cuenta: 'c-bp',
    divisaUsd: 10,
    verificada: false,
  },
  // Todo en efectivo en dólares: es la carrera que se le paga al repartidor con
  // los dólares de la caja, no con lo que entró por pago móvil.
  {
    factura: '45371',
    cliente: 'Elena Navas',
    telefono: '0424-5566778',
    direccion: 'Maripérez, subida al teleférico',
    zona: 'Maripérez',
    repartidor: 'r2',
    pedido: 16,
    divisaUsd: 19,
    verificada: false,
  },
]

export interface SemillaCargada {
  ordenes: Orden[]
  pagos: Pago[]
}

/**
 * Arma las órdenes y sus pagos.
 *
 * Ojo con la factura 45368: no está. El salto es a propósito, para que se vea
 * el aviso de correlativo incompleto — el tipo de hueco que hoy se descubre
 * días después.
 */
export function cargarSemillas(zonasPorNombre: Map<string, { id: string; tarifa: number; pago: number }>): SemillaCargada {
  const ordenes: Orden[] = []
  const pagos: Pago[] = []

  SEMILLAS.forEach((semilla, i) => {
    const esPickup = semilla.tipo === 'pickup'
    const zona = zonasPorNombre.get(semilla.zona)
    // Un pick up no tiene zona; el delivery sin zona conocida se descarta.
    if (!esPickup && !zona) return

    const id = `o-${semilla.factura}`
    ordenes.push({
      id,
      fecha_operativa: HOY,
      numero_factura: semilla.factura,
      tipo: semilla.tipo ?? 'delivery',
      cliente_nombre: semilla.cliente,
      cliente_telefono: semilla.telefono,
      direccion: semilla.direccion,
      zona_id: esPickup ? null : zona!.id,
      tarifa_cliente_usd: esPickup ? 0 : zona!.tarifa,
      pago_repartidor_usd: esPickup ? 0 : zona!.pago,
      repartidor_id: semilla.repartidor,
      monto_pedido_usd: semilla.pedido,
      tasa_bs_por_usd: TASA_DEMO,
      estado: semilla.verificada ? 'verificada' : 'pendiente',
      motivo_anulacion: null,
      notas: semilla.notas ?? null,
      verificada_por: semilla.verificada ? 'u-admin' : null,
      verificada_en: semilla.verificada ? new Date().toISOString() : null,
      creada_por: 'u-cajera',
      creada_en: new Date(Date.now() - (SEMILLAS.length - i) * 12 * 60_000).toISOString(),
      actualizada_en: new Date().toISOString(),
    })

    if (semilla.pagoMovilBs) {
      pagos.push({
        id: `p-${semilla.factura}-1`,
        orden_id: id,
        metodo: 'pago_movil',
        cuenta_id: semilla.cuenta ?? 'c-bp',
        banco_id: 'b-banesco',
        referencia: semilla.referencia ?? null,
        emisor: semilla.telefono,
        monto: semilla.pagoMovilBs,
        moneda: 'BS',
        imagen_path: 'demo/captura.png',
        creado_en: new Date().toISOString(),
      })
    }

    if (semilla.divisaUsd) {
      pagos.push({
        id: `p-${semilla.factura}-2`,
        orden_id: id,
        metodo: 'efectivo_usd',
        cuenta_id: null,
        banco_id: null,
        referencia: null,
        emisor: null,
        monto: semilla.divisaUsd,
        moneda: 'USD',
        imagen_path: null,
        creado_en: new Date().toISOString(),
      })
    }
  })

  return { ordenes, pagos }
}

export const CIERRES_DEMO: Cierre[] = []
