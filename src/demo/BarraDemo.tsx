import { useState } from 'react'
import { cambiarUsuarioDemo } from './supabase'
import { ETIQUETA_ROL, type RolUsuario } from '../lib/tipos'

const ROLES: RolUsuario[] = ['cajera', 'admin', 'dueno']

/**
 * Barra de la demo.
 *
 * Deja mirar la app con los ojos de cada rol, que es lo que hace falta para
 * decidir si el flujo sirve antes de montar nada. Solo existe en el build de
 * demostración: la app de producción no la incluye.
 */
export function BarraDemo() {
  const [rol, setRol] = useState<RolUsuario>('admin')
  const [abierta, setAbierta] = useState(true)

  if (!abierta) {
    return (
      <button
        onClick={() => setAbierta(true)}
        className="fixed bottom-3 right-3 z-50 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg"
      >
        Demo
      </button>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-amber-400 bg-amber-50 px-4 py-2.5 shadow-lg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-bold text-amber-900">Demostración</span>
        <span className="hidden text-amber-800 sm:inline">
          Datos de mentira. Nada se guarda: al recargar vuelve todo al inicio.
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="font-semibold text-amber-900">Ver como:</span>
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRol(r)
                cambiarUsuarioDemo(r)
              }}
              className={`min-h-9 rounded-lg px-3 font-bold transition-colors ${
                rol === r ? 'bg-amber-500 text-white' : 'bg-white text-amber-900 hover:bg-amber-100'
              }`}
            >
              {ETIQUETA_ROL[r]}
            </button>
          ))}
          <button
            onClick={() => setAbierta(false)}
            className="min-h-9 px-2 font-bold text-amber-700"
            aria-label="Ocultar la barra de demostración"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
