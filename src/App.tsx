import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProveedorSesion, useSesion } from './contexto/Sesion'
import { configurado } from './lib/supabase'
import { Layout } from './componentes/Layout'
import { Alerta, Cargando } from './componentes/UI'
import { Login } from './paginas/Login'
import { NuevaOrden } from './paginas/NuevaOrden'
import { Asignar } from './paginas/Asignar'
import { OrdenesDelDia } from './paginas/OrdenesDelDia'
import { EditarOrden } from './paginas/EditarOrden'
import { Verificacion } from './paginas/Verificacion'
import { Cierre } from './paginas/Cierre'
import { Liquidacion } from './paginas/Liquidacion'
import { Configuracion } from './paginas/Configuracion'

/** Ruta que solo ven ciertos roles; al resto se le manda a la lista de órdenes. */
function SoloRol({ roles, children }: { roles: Array<'cajera' | 'admin' | 'dueno'>; children: React.ReactNode }) {
  const { usuario } = useSesion()
  if (!usuario || !roles.includes(usuario.rol)) return <Navigate to="/ordenes" replace />
  return <>{children}</>
}

function Rutas() {
  const { cargando, usuario } = useSesion()

  if (cargando) return <Cargando texto="Entrando…" />
  if (!usuario) return <Login />

  // La cajera arranca cargando; los demás, mirando lo cargado.
  const inicio = usuario.rol === 'dueno' ? '/liquidacion' : usuario.rol === 'admin' ? '/verificar' : '/nueva'

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={inicio} replace />} />
        <Route
          path="/nueva"
          element={
            <SoloRol roles={['cajera', 'admin']}>
              <NuevaOrden />
            </SoloRol>
          }
        />
        <Route
          path="/asignar"
          element={
            <SoloRol roles={['cajera', 'admin']}>
              <Asignar />
            </SoloRol>
          }
        />
        <Route path="/ordenes" element={<OrdenesDelDia />} />
        <Route
          path="/orden/:id"
          element={
            <SoloRol roles={['cajera', 'admin']}>
              <EditarOrden />
            </SoloRol>
          }
        />
        <Route
          path="/verificar"
          element={
            <SoloRol roles={['admin']}>
              <Verificacion />
            </SoloRol>
          }
        />
        <Route path="/cierre" element={<Cierre />} />
        <Route path="/liquidacion" element={<Liquidacion />} />
        <Route
          path="/configuracion"
          element={
            <SoloRol roles={['admin']}>
              <Configuracion />
            </SoloRol>
          }
        />
        <Route path="*" element={<Navigate to={inicio} replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  // Sin credenciales de Supabase la app no puede hacer nada. Vale mucho más
  // explicarlo que dejar una pantalla en blanco con un error en la consola.
  if (!configurado) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Alerta tono="error" titulo="Falta configurar la conexión">
          <p className="mb-2">
            Crea un archivo <code>.env</code> en la raíz del proyecto (puedes copiar <code>.env.example</code>) con:
          </p>
          <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs">
            VITE_SUPABASE_URL=https://xxxxx.supabase.co{'\n'}
            VITE_SUPABASE_ANON_KEY=eyJhbGci...
          </pre>
          <p className="mt-2">
            Los dos valores salen del panel de Supabase, en <em>Project Settings → API</em>. Después reinicia{' '}
            <code>npm run dev</code>.
          </p>
        </Alerta>
      </div>
    )
  }

  return (
    <ProveedorSesion>
      {/*
        Rutas con `#`. Nadie escribe ni comparte estas direcciones, así que las
        URLs bonitas no aportan nada, y a cambio la app funciona igual en
        cualquier hosting estático sin regla de reescritura: sin esto, refrescar
        la pantalla de Liquidación daría 404 en producción.
      */}
      <HashRouter>
        <Rutas />
      </HashRouter>
    </ProveedorSesion>
  )
}

export default App
