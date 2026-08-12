import { useCallback, useEffect, useState } from 'react'
import { supabase, mensajeDeError } from '../lib/supabase'

/**
 * Tasa Bs/USD del día operativo.
 *
 * El delivery está tarifado en dólares pero el pago móvil entra en bolívares,
 * así que sin tasa no hay forma de cuadrar la caja. La app la exige una vez al
 * abrir la jornada y la usa para todas las órdenes de ese día.
 */
export function useTasa(fecha: string) {
  const [tasa, setTasa] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('tasas_cambio')
      .select('bs_por_usd')
      .eq('fecha', fecha)
      .maybeSingle()

    if (error) setError(mensajeDeError(error))
    setTasa(data ? Number(data.bs_por_usd) : null)
    setCargando(false)
  }, [fecha])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const guardar = useCallback(
    async (valor: number) => {
      const { error } = await supabase
        .from('tasas_cambio')
        .upsert({ fecha, bs_por_usd: valor }, { onConflict: 'fecha' })
      if (error) throw new Error(mensajeDeError(error))
      setTasa(valor)
    },
    [fecha],
  )

  return { tasa, cargando, error, guardar, recargar: cargar }
}
