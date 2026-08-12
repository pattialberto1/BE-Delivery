import { useEffect, useMemo, useRef, useState } from 'react'
import { buscarPorNombre, formatearUSD } from '../lib/reglas'
import type { Zona } from '../lib/tipos'

/**
 * Selector de zona con búsqueda.
 *
 * El cuadro tiene 104 zonas. Un desplegable con 104 opciones es inusable en una
 * tablet con el cliente esperando en el teléfono, así que aquí se teclea parte
 * del nombre ("chac", "penon") y la lista se filtra. La búsqueda ignora tildes
 * y mayúsculas.
 */

interface Props {
  zonas: Zona[]
  valor: string
  onCambiar: (zonaId: string) => void
  error?: string
}

export function SelectorZona({ zonas, valor, onCambiar, error }: Props) {
  const [consulta, setConsulta] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const contenedor = useRef<HTMLDivElement>(null)

  const activas = useMemo(() => zonas.filter((z) => z.activo), [zonas])
  const elegida = useMemo(() => zonas.find((z) => z.id === valor), [zonas, valor])
  const resultados = useMemo(() => buscarPorNombre(activas, consulta), [activas, consulta])

  // Cerrar al tocar fuera; si no, en la tablet la lista queda abierta encima
  // del resto del formulario.
  useEffect(() => {
    if (!abierto) return
    function alTocarFuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alTocarFuera)
    return () => document.removeEventListener('mousedown', alTocarFuera)
  }, [abierto])

  useEffect(() => {
    setResaltado(0)
  }, [consulta])

  function elegir(zona: Zona) {
    onCambiar(zona.id)
    setConsulta('')
    setAbierto(false)
  }

  return (
    <div ref={contenedor} className="relative">
      <input
        value={abierto ? consulta : (elegida?.nombre ?? '')}
        onChange={(e) => {
          setConsulta(e.target.value)
          setAbierto(true)
        }}
        onFocus={() => {
          setConsulta('')
          setAbierto(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setAbierto(true)
            setResaltado((i) => Math.min(i + 1, resultados.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setResaltado((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && abierto && resultados[resaltado]) {
            e.preventDefault()
            elegir(resultados[resaltado])
          } else if (e.key === 'Escape') {
            setAbierto(false)
          }
        }}
        placeholder="Escribe la zona…"
        role="combobox"
        aria-expanded={abierto}
        aria-controls="lista-zonas"
        aria-autocomplete="list"
        className={`min-h-12 w-full rounded-lg border bg-white px-3 text-slate-900 outline-none
          focus:border-marca-600 focus:ring-2 focus:ring-marca-200
          ${error ? 'border-red-400' : 'border-slate-300'}`}
      />

      {/* Con la zona elegida y el campo cerrado, la tarifa se ve sin abrir nada. */}
      {elegida && !abierto && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-marca-100 px-2 py-0.5 text-sm font-bold text-marca-800">
          {formatearUSD(elegida.tarifa_cliente_usd)}
        </span>
      )}

      {abierto && (
        <ul
          id="lista-zonas"
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg"
        >
          {resultados.map((zona, i) => (
            <li key={zona.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === resaltado}
                // onMouseDown y no onClick: el blur del input cerraría la lista
                // antes de que el clic llegue a registrarse.
                onMouseDown={(e) => {
                  e.preventDefault()
                  elegir(zona)
                }}
                onMouseEnter={() => setResaltado(i)}
                className={`flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left
                  ${i === resaltado ? 'bg-marca-50' : ''}
                  ${zona.id === valor ? 'font-bold' : ''}`}
              >
                <span>{zona.nombre}</span>
                <span className="shrink-0 font-bold tabular-nums text-slate-600">
                  {formatearUSD(zona.tarifa_cliente_usd)}
                </span>
              </button>
            </li>
          ))}

          {resultados.length === 0 && (
            <li className="px-3 py-4 text-center text-slate-500">
              No hay ninguna zona que diga «{consulta}».
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
