/**
 * Supabase de mentira, para la demo.
 *
 * Reemplaza a `src/lib/supabase.ts` mediante un alias que solo existe en el
 * build de demostración (`vite.config.demo.ts`). El código de la app no cambia
 * ni se entera: sigue llamando a `supabase.from(...)` igual que siempre.
 *
 * Todo vive en memoria y se pierde al recargar la página. Sirve para ver y
 * tocar el sistema antes de crear ninguna cuenta.
 */

import {
  BANCOS_DEMO,
  CAPTURA_FALSA,
  CIERRES_DEMO,
  CUENTAS_DEMO,
  HOY,
  REPARTIDORES_DEMO,
  TASA_DEMO,
  USUARIOS_DEMO,
  ZONAS_DEMO,
  cargarSemillas,
} from './datos'
import type { Cierre, Cuenta, Orden, OrdenDetalle, Pago, TasaCambio } from '../lib/tipos'

export const configurado = true
export const BUCKET_CAPTURAS = 'capturas'
export const DOMINIO_INTERNO = 'broaster.local'

export function correoDeUsuario(entrada: string): string {
  const limpio = entrada.trim().toLowerCase()
  return limpio.includes('@') ? limpio : `${limpio}@${DOMINIO_INTERNO}`
}

/** En la demo el alta de usuarios no crea nada real, solo simula el resultado. */
export async function crearUsuario(datos: { usuario: string; clave: string; nombre: string }): Promise<string> {
  const id = crypto.randomUUID()
  ;(tablas.usuarios as unknown[]).push({
    id,
    nombre: datos.nombre,
    usuario: datos.usuario.trim().toLowerCase(),
    rol: 'cajera',
    activo: false,
    creado_en: new Date().toISOString(),
  })
  return id
}

// ---------------------------------------------------------------------------
// El "servidor": tablas en memoria
// ---------------------------------------------------------------------------

const zonasPorNombre = new Map(
  ZONAS_DEMO.map((z) => [z.nombre, { id: z.id, tarifa: z.tarifa_cliente_usd, pago: z.pago_repartidor_usd }]),
)
const semillas = cargarSemillas(zonasPorNombre)

const tablas: Record<string, unknown[]> = {
  usuarios: [...USUARIOS_DEMO],
  zonas: [...ZONAS_DEMO],
  repartidores: [...REPARTIDORES_DEMO],
  bancos: [...BANCOS_DEMO],
  cuentas: [...CUENTAS_DEMO],
  tasas_cambio: [{ fecha: HOY, bs_por_usd: TASA_DEMO, cargada_por: 'u-admin', cargada_en: new Date().toISOString() }],
  ordenes: semillas.ordenes,
  pagos: semillas.pagos,
  cierres: [...CIERRES_DEMO],
}

/** Recompone `v_ordenes_detalle`, que en la base real es una vista SQL. */
function vistaOrdenesDetalle(): OrdenDetalle[] {
  const ordenes = tablas.ordenes as Orden[]
  const pagos = tablas.pagos as Pago[]

  return ordenes
    .filter((o) => o.estado !== 'anulada')
    .map((o) => {
      const zona = ZONAS_DEMO.find((z) => z.id === o.zona_id)
      const repartidor = REPARTIDORES_DEMO.find((r) => r.id === o.repartidor_id)
      const suyos = pagos.filter((p) => p.orden_id === o.id)
      const pagado = suyos.reduce(
        (suma, p) => suma + (p.moneda === 'USD' ? Number(p.monto) : Number(p.monto) / Number(o.tasa_bs_por_usd)),
        0,
      )
      const divisa = suyos.reduce((suma, p) => suma + (p.moneda === 'USD' ? Number(p.monto) : 0), 0)
      const bolivares = suyos.reduce((suma, p) => suma + (p.moneda === 'BS' ? Number(p.monto) : 0), 0)
      const total = Number(o.monto_pedido_usd) + Number(o.tarifa_cliente_usd)

      return {
        id: o.id,
        fecha_operativa: o.fecha_operativa,
        numero_factura: o.numero_factura,
        tipo: o.tipo,
        facturada_aparte: o.facturada_aparte ?? false,
        moneda_facturada: o.moneda_facturada ?? null,
        cliente_nombre: o.cliente_nombre,
        cliente_telefono: o.cliente_telefono,
        direccion: o.direccion,
        zona: zona?.nombre ?? 'Pick Up',
        tarifa_cliente_usd: Number(o.tarifa_cliente_usd),
        pago_repartidor_usd: Number(o.pago_repartidor_usd),
        margen_delivery_usd: Number(o.tarifa_cliente_usd) - Number(o.pago_repartidor_usd),
        repartidor: repartidor?.nombre ?? null,
        repartidor_id: o.repartidor_id,
        monto_pedido_usd: Number(o.monto_pedido_usd),
        total_usd: total,
        tasa_bs_por_usd: Number(o.tasa_bs_por_usd),
        estado: o.estado,
        notas: o.notas,
        cargada_por: USUARIOS_DEMO.find((u) => u.id === o.creada_por)?.nombre ?? null,
        creada_en: o.creada_en,
        pagado_usd: pagado,
        pagado_divisa_usd: divisa,
        pagado_bs: bolivares,
        diferencia_usd: Math.round((pagado - total) * 100) / 100,
        cantidad_pagos: suyos.length,
        referencias: suyos.map((p) => p.referencia).filter(Boolean).join(' · ') || null,
      }
    })
}

function filas(tabla: string): unknown[] {
  if (tabla === 'v_ordenes_detalle') return vistaOrdenesDetalle()
  return tablas[tabla] ?? []
}

// ---------------------------------------------------------------------------
// Constructor de consultas
//
// Imita lo justo de la API de postgrest que usa la app: los encadenados
// .select().eq().order().maybeSingle() y compañía, resueltos con `await`.
// ---------------------------------------------------------------------------

type Fila = Record<string, unknown>
type Filtro = (fila: Fila) => boolean

interface Resultado {
  data: unknown
  error: { message: string } | null
}

class Consulta implements PromiseLike<Resultado> {
  private filtros: Filtro[] = []
  private ordenamientos: string[] = []
  private modo: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private payload: Fila | Fila[] = {}
  private unico: 'single' | 'maybe' | null = null
  private incrustarOrdenes = false
  private tabla: string

  constructor(tabla: string) {
    this.tabla = tabla
  }

  select(columnas = '*') {
    // La app pide los pagos junto con su orden: `ordenes!inner(...)`.
    if (columnas.includes('ordenes!inner')) this.incrustarOrdenes = true
    if (this.modo === 'select') this.modo = 'select'
    return this
  }

  insert(valores: Fila | Fila[]) {
    this.modo = 'insert'
    this.payload = valores
    return this
  }

  update(valores: Fila) {
    this.modo = 'update'
    this.payload = valores
    return this
  }

  upsert(valores: Fila) {
    this.modo = 'upsert'
    this.payload = valores
    return this
  }

  delete() {
    this.modo = 'delete'
    return this
  }

  eq(columna: string, valor: unknown) {
    this.filtros.push((fila) => String(fila[columna] ?? '') === String(valor))
    return this
  }

  gte(columna: string, valor: string) {
    const campo = columna.includes('.') ? columna.split('.').pop()! : columna
    this.filtros.push((fila) => String(fila[campo] ?? '') >= valor)
    return this
  }

  lte(columna: string, valor: string) {
    const campo = columna.includes('.') ? columna.split('.').pop()! : columna
    this.filtros.push((fila) => String(fila[campo] ?? '') <= valor)
    return this
  }

  not(columna: string, _operador: string, _valor: unknown) {
    this.filtros.push((fila) => fila[columna] != null)
    return this
  }

  in(columna: string, valores: unknown[]) {
    const conjunto = new Set(valores.map(String))
    this.filtros.push((fila) => conjunto.has(String(fila[columna])))
    return this
  }

  order(columna: string) {
    this.ordenamientos.push(columna)
    return this
  }

  single() {
    this.unico = 'single'
    return this
  }

  maybeSingle() {
    this.unico = 'maybe'
    return this
  }

  private aplicar(): Fila[] {
    let resultado = filas(this.tabla) as Fila[]

    // El filtro por fecha de la orden viaja en la consulta de pagos, así que
    // hay que resolver la orden antes de poder filtrar.
    if (this.incrustarOrdenes) {
      const ordenes = tablas.ordenes as Orden[]
      resultado = resultado.map((fila) => ({
        ...fila,
        ordenes: ordenes.find((o) => o.id === fila.orden_id) ?? null,
      }))
      resultado = resultado.filter((fila) => fila.ordenes)
      resultado = resultado.filter((fila) =>
        this.filtros.every((filtro) => filtro(fila) || filtro((fila.ordenes ?? {}) as Fila)),
      )
    } else {
      resultado = resultado.filter((fila) => this.filtros.every((filtro) => filtro(fila)))
    }

    for (const columna of [...this.ordenamientos].reverse()) {
      resultado = [...resultado].sort((a, b) =>
        String(a[columna] ?? '').localeCompare(String(b[columna] ?? ''), 'es', { numeric: true }),
      )
    }
    return resultado
  }

  private ejecutar(): Resultado {
    const destino = tablas[this.tabla]

    if (this.modo === 'insert' || this.modo === 'upsert') {
      const nuevas: Fila[] = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((fila) => ({
        id: fila.id ?? crypto.randomUUID(),
        creado_en: new Date().toISOString(),
        creada_en: new Date().toISOString(),
        ...fila,
      }))

      if (this.modo === 'upsert' && this.tabla === 'tasas_cambio') {
        const tasas = destino as TasaCambio[]
        for (const fila of nuevas) {
          const existente = tasas.find((t) => t.fecha === fila.fecha)
          if (existente) existente.bs_por_usd = Number(fila.bs_por_usd)
          else tasas.push(fila as unknown as TasaCambio)
        }
        return { data: nuevas, error: null }
      }

      // La factura repetida es el único choque que la demo simula, porque es el
      // que la cajera puede provocar tecleando.
      if (this.tabla === 'ordenes') {
        const ordenes = destino as Orden[]
        for (const fila of nuevas) {
          if (ordenes.some((o) => o.fecha_operativa === fila.fecha_operativa && o.numero_factura === fila.numero_factura)) {
            return { data: null, error: { message: 'factura_unica_por_dia' } }
          }
        }
      }

      destino.push(...nuevas)
      return { data: this.unico ? nuevas[0] : nuevas, error: null }
    }

    if (this.modo === 'update') {
      for (const fila of this.aplicar()) Object.assign(fila, this.payload)
      return { data: null, error: null }
    }

    if (this.modo === 'delete') {
      const aBorrar = new Set(this.aplicar())
      tablas[this.tabla] = destino.filter((fila) => !aBorrar.has(fila as Fila))
      return { data: null, error: null }
    }

    const resultado = this.aplicar()
    if (this.unico === 'single') {
      return resultado[0]
        ? { data: resultado[0], error: null }
        : { data: null, error: { message: 'No se encontró el registro.' } }
    }
    if (this.unico === 'maybe') return { data: resultado[0] ?? null, error: null }
    return { data: resultado, error: null }
  }

  then<R1 = Resultado, R2 = never>(
    alCumplir?: ((valor: Resultado) => R1 | PromiseLike<R1>) | null,
    alFallar?: ((razon: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    // Un pelín de retardo para que se vean los estados de "cargando".
    return new Promise<Resultado>((resolve) => setTimeout(() => resolve(this.ejecutar()), 80)).then(alCumplir, alFallar)
  }
}

// ---------------------------------------------------------------------------
// Sesión de mentira, con cambio de rol
// ---------------------------------------------------------------------------

type Oyente = (evento: string, sesion: unknown) => void

let usuarioActual = USUARIOS_DEMO[0]
const oyentes = new Set<Oyente>()

function sesionDe(usuario: typeof usuarioActual | null) {
  return usuario ? { user: { id: usuario.id, email: `${usuario.rol}@demo.local` } } : null
}

/** Cambia el rol con el que se está viendo la demo. */
export function cambiarUsuarioDemo(rol: 'cajera' | 'admin' | 'dueno') {
  usuarioActual = USUARIOS_DEMO.find((u) => u.rol === rol) ?? USUARIOS_DEMO[0]
  for (const oyente of oyentes) oyente('SIGNED_IN', sesionDe(usuarioActual))
}

export function usuarioDemoActual() {
  return usuarioActual
}

export const supabase = {
  from: (tabla: string) => new Consulta(tabla),
  auth: {
    getSession: async () => ({ data: { session: sesionDe(usuarioActual) }, error: null }),
    onAuthStateChange: (oyente: Oyente) => {
      oyentes.add(oyente)
      return { data: { subscription: { unsubscribe: () => oyentes.delete(oyente) } } }
    },
    signInWithPassword: async () => {
      for (const oyente of oyentes) oyente('SIGNED_IN', sesionDe(usuarioActual))
      return { data: { session: sesionDe(usuarioActual) }, error: null }
    },
    signUp: async () => ({ data: {}, error: null }),
    signOut: async () => {
      for (const oyente of oyentes) oyente('SIGNED_IN', sesionDe(usuarioActual))
      return { error: null }
    },
  },
  storage: {
    from: () => ({
      upload: async () => ({ data: { path: 'demo/captura.png' }, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: CAPTURA_FALSA }, error: null }),
    }),
  },
}

export async function subirCaptura(): Promise<string> {
  return 'demo/captura.png'
}

export async function urlDeCaptura(): Promise<string | null> {
  return CAPTURA_FALSA
}

export function mensajeDeError(error: unknown): string {
  const texto = (error as { message?: string })?.message ?? String(error ?? '')
  if (texto.includes('factura_unica_por_dia')) return 'Ese número de factura ya está cargado hoy.'
  if (texto.includes('pagos_referencia')) {
    return 'Esa referencia ya fue cargada antes. Revisa si el cliente mandó la misma captura dos veces.'
  }
  return texto || 'Ocurrió un error desconocido.'
}

export type { Cierre, Cuenta }
