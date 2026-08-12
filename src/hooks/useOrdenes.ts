import { useCallback, useEffect, useState } from 'react'
import { mensajeDeError, supabase } from '../lib/supabase'
import type { OrdenDetalle } from '../lib/tipos'

/** Órdenes de un día operativo, ya con totales calculados por la vista SQL. */
export function useOrdenes(fecha: string) {
  const [ordenes, setOrdenes] = useState<OrdenDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('v_ordenes_detalle')
      .select('*')
      .eq('fecha_operativa', fecha)
      .order('numero_factura')

    if (error) setError(mensajeDeError(error))
    setOrdenes((data ?? []) as OrdenDetalle[])
    setCargando(false)
  }, [fecha])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return { ordenes, cargando, error, recargar: cargar }
}

/** Órdenes de un rango de fechas, para los reportes de varios días. */
export function useOrdenesRango(desde: string, hasta: string) {
  const [ordenes, setOrdenes] = useState<OrdenDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('v_ordenes_detalle')
      .select('*')
      .gte('fecha_operativa', desde)
      .lte('fecha_operativa', hasta)
      .order('fecha_operativa')
      .order('numero_factura')

    if (error) setError(mensajeDeError(error))
    setOrdenes((data ?? []) as OrdenDetalle[])
    setCargando(false)
  }, [desde, hasta])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return { ordenes, cargando, error, recargar: cargar }
}
