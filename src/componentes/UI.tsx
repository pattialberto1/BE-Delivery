import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from 'react'

/**
 * Piezas básicas de la interfaz.
 *
 * Todo está dimensionado para usarse con el dedo sobre una tablet mientras se
 * atiende por WhatsApp: controles altos, texto grande y contraste fuerte.
 */

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma'

const ESTILO_VARIANTE: Record<Variante, string> = {
  primario: 'bg-marca-700 text-white hover:bg-marca-800 active:bg-marca-800 disabled:bg-slate-300',
  secundario:
    'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400',
  peligro: 'bg-white text-red-700 border border-red-300 hover:bg-red-50 active:bg-red-100',
  fantasma: 'bg-transparent text-slate-600 hover:bg-slate-200 active:bg-slate-300',
}

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  ancho?: boolean
}

export function Boton({ variante = 'primario', ancho, className = '', ...props }: PropsBoton) {
  return (
    <button
      {...props}
      className={`min-h-12 rounded-lg px-5 font-semibold transition-colors disabled:cursor-not-allowed ${
        ESTILO_VARIANTE[variante]
      } ${ancho ? 'w-full' : ''} ${className}`}
    />
  )
}

interface PropsCampo {
  etiqueta: string
  children: ReactNode
  ayuda?: string
  error?: string
  requerido?: boolean
  className?: string
}

export function Campo({ etiqueta, children, ayuda, error, requerido, className = '' }: PropsCampo) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-semibold text-slate-700">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-marca-600">*</span>}
      </span>
      {children}
      {error ? (
        <span className="text-sm font-medium text-red-700">{error}</span>
      ) : ayuda ? (
        <span className="text-sm text-slate-500">{ayuda}</span>
      ) : null}
    </label>
  )
}

const ESTILO_ENTRADA =
  'min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 outline-none ' +
  'focus:border-marca-600 focus:ring-2 focus:ring-marca-200 disabled:bg-slate-100 disabled:text-slate-500'

export function Entrada({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input {...props} className={`${ESTILO_ENTRADA} ${className}`} />
}

export function Seleccion({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${ESTILO_ENTRADA} ${className}`} />
}

export function AreaTexto({ className = '', ...props }: InputHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...(props as object)}
      className={`${ESTILO_ENTRADA} min-h-24 resize-y py-2 ${className}`}
    />
  )
}

export function Tarjeta({
  titulo,
  children,
  acciones,
  className = '',
}: {
  titulo?: string
  children: ReactNode
  acciones?: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          {titulo && <h2 className="text-lg font-bold text-slate-800">{titulo}</h2>}
          {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

type TonoAlerta = 'error' | 'aviso' | 'exito' | 'info'

const ESTILO_ALERTA: Record<TonoAlerta, string> = {
  error: 'border-red-300 bg-red-50 text-red-900',
  aviso: 'border-amber-300 bg-amber-50 text-amber-900',
  exito: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
}

export function Alerta({
  tono = 'info',
  titulo,
  children,
  className = '',
}: {
  tono?: TonoAlerta
  titulo?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div role="alert" className={`rounded-lg border px-4 py-3 ${ESTILO_ALERTA[tono]} ${className}`}>
      {titulo && <p className="font-bold">{titulo}</p>}
      {children && <div className="text-sm leading-relaxed">{children}</div>}
    </div>
  )
}

const ESTILO_INSIGNIA: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-900 border-amber-300',
  verificada: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  anulada: 'bg-slate-200 text-slate-600 border-slate-300',
  neutro: 'bg-slate-100 text-slate-700 border-slate-300',
  alerta: 'bg-red-100 text-red-900 border-red-300',
}

export function Insignia({ tono = 'neutro', children }: { tono?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${
        ESTILO_INSIGNIA[tono] ?? ESTILO_INSIGNIA.neutro
      }`}
    >
      {children}
    </span>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-marca-600" />
      <span className="font-medium">{texto}</span>
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-slate-500">{children}</p>
}

/** Cifra grande para los cuadros de totales. */
export function Dato({
  etiqueta,
  valor,
  detalle,
  tono = 'normal',
}: {
  etiqueta: string
  valor: ReactNode
  detalle?: ReactNode
  tono?: 'normal' | 'bueno' | 'malo'
}) {
  const color = tono === 'bueno' ? 'text-emerald-700' : tono === 'malo' ? 'text-red-700' : 'text-slate-900'
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-sm text-slate-500">{detalle}</p>}
    </div>
  )
}

/** Envuelve una tabla ancha para que haga scroll sola en la tablet. */
export function ContenedorTabla({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`-mx-4 overflow-x-auto px-4 ${className}`}>{children}</div>
}
