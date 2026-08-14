import { NavLink, Outlet } from 'react-router-dom'
import { useSesion } from '../contexto/Sesion'
import { formatearFecha } from '../lib/reglas'
import { ETIQUETA_ROL } from '../lib/tipos'
import { Boton } from './UI'

interface Enlace {
  a: string
  texto: string
  /** Roles que ven este enlace. Sin lista, lo ve todo el mundo. */
  roles?: Array<'cajera' | 'admin' | 'dueno'>
}

const ENLACES: Enlace[] = [
  { a: '/nueva', texto: 'Nueva orden', roles: ['cajera', 'admin'] },
  { a: '/asignar', texto: 'Asignar', roles: ['cajera', 'admin'] },
  { a: '/ordenes', texto: 'Órdenes del día' },
  { a: '/verificar', texto: 'Verificar', roles: ['admin'] },
  { a: '/cierre', texto: 'Cierre' },
  { a: '/liquidacion', texto: 'Liquidación' },
  { a: '/configuracion', texto: 'Configuración', roles: ['admin'] },
]

export function Layout() {
  const { usuario, hoy, salir } = useSesion()
  const rol = usuario?.rol

  const visibles = ENLACES.filter((enlace) => !enlace.roles || (rol && enlace.roles.includes(rol)))

  return (
    <div className="flex min-h-full flex-col">
      <header className="no-imprimir sticky top-0 z-10 border-b border-slate-300 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-black tracking-tight text-marca-700">Broaster Express</span>
            <span className="text-sm font-semibold text-slate-500">Delivery</span>
          </div>

          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700">
            Jornada: {formatearFecha(hoy)}
          </span>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {usuario?.nombre} · {rol ? ETIQUETA_ROL[rol] : ''}
            </span>
            <Boton variante="fantasma" onClick={() => void salir()} className="min-h-10 px-3 text-sm">
              Salir
            </Boton>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-1">
          {visibles.map((enlace) => (
            <NavLink
              key={enlace.a}
              to={enlace.a}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-t-lg border-b-3 px-4 py-2.5 text-sm font-bold transition-colors ${
                  isActive
                    ? 'border-marca-600 text-marca-700'
                    : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`
              }
            >
              {enlace.texto}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        <Outlet />
      </main>
    </div>
  )
}
