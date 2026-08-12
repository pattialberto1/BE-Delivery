import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fechaOperativa } from '../lib/reglas'
import type { Banco, Cuenta, Repartidor, Usuario, Zona } from '../lib/tipos'

/** Hora a partir de la cual empieza el día operativo nuevo. Configurable por entorno. */
const HORA_CORTE = Number(import.meta.env.VITE_HORA_CORTE ?? '5')

interface ValorSesion {
  cargando: boolean
  sesion: Session | null
  usuario: Usuario | null
  /** El usuario existe en Auth pero un admin todavía no lo activó. */
  sinActivar: boolean
  zonas: Zona[]
  repartidores: Repartidor[]
  bancos: Banco[]
  /** Cuentas propias del local: dónde puede caer la plata. */
  cuentas: Cuenta[]
  /** Día operativo en curso, en formato YYYY-MM-DD. */
  hoy: string
  puedeEscribir: boolean
  esAdmin: boolean
  recargarCatalogos: () => Promise<void>
  salir: () => Promise<void>
}

const ContextoSesion = createContext<ValorSesion | null>(null)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [sinActivar, setSinActivar] = useState(false)
  const [zonas, setZonas] = useState<Zona[]>([])
  const [repartidores, setRepartidores] = useState<Repartidor[]>([])
  const [bancos, setBancos] = useState<Banco[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [hoy, setHoy] = useState(() => fechaOperativa(new Date(), HORA_CORTE))

  // El local trabaja de noche y la tablet queda abierta: si la app sigue viva
  // cuando pasa la hora de corte, el día operativo tiene que rodar solo.
  useEffect(() => {
    const id = setInterval(() => {
      setHoy((anterior) => {
        const actual = fechaOperativa(new Date(), HORA_CORTE)
        return actual === anterior ? anterior : actual
      })
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const cargarUsuario = useCallback(async (idUsuario: string) => {
    const { data, error } = await supabase.from('usuarios').select('*').eq('id', idUsuario).maybeSingle()

    if (error || !data) {
      setUsuario(null)
      setSinActivar(true)
      return
    }
    if (!data.activo) {
      setUsuario(null)
      setSinActivar(true)
      return
    }
    setUsuario(data as Usuario)
    setSinActivar(false)
  }, [])

  const recargarCatalogos = useCallback(async () => {
    const [resZonas, resRepartidores, resBancos, resCuentas] = await Promise.all([
      supabase.from('zonas').select('*').order('orden').order('nombre'),
      supabase.from('repartidores').select('*').order('nombre'),
      supabase.from('bancos').select('*').order('orden').order('nombre'),
      supabase.from('cuentas').select('*').order('orden').order('nombre'),
    ])
    if (resZonas.data) setZonas(resZonas.data as Zona[])
    if (resRepartidores.data) setRepartidores(resRepartidores.data as Repartidor[])
    if (resBancos.data) setBancos(resBancos.data as Banco[])
    if (resCuentas.data) setCuentas(resCuentas.data as Cuenta[])
  }, [])

  useEffect(() => {
    let vivo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!vivo) return
      setSesion(data.session)
      if (data.session) await cargarUsuario(data.session.user.id)
      if (vivo) setCargando(false)
    })

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion)
      if (nuevaSesion) {
        void cargarUsuario(nuevaSesion.user.id)
      } else {
        setUsuario(null)
        setSinActivar(false)
      }
    })

    return () => {
      vivo = false
      suscripcion.subscription.unsubscribe()
    }
  }, [cargarUsuario])

  // Los catálogos solo se pueden leer con un usuario activo (así lo exige RLS).
  useEffect(() => {
    if (usuario) void recargarCatalogos()
  }, [usuario, recargarCatalogos])

  const salir = useCallback(async () => {
    await supabase.auth.signOut()
    setUsuario(null)
    setSesion(null)
  }, [])

  const valor = useMemo<ValorSesion>(
    () => ({
      cargando,
      sesion,
      usuario,
      sinActivar,
      zonas,
      repartidores,
      bancos,
      cuentas,
      hoy,
      puedeEscribir: usuario?.rol === 'cajera' || usuario?.rol === 'admin',
      esAdmin: usuario?.rol === 'admin',
      recargarCatalogos,
      salir,
    }),
    [cargando, sesion, usuario, sinActivar, zonas, repartidores, bancos, cuentas, hoy, recargarCatalogos, salir],
  )

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion)
  if (!valor) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>')
  return valor
}
