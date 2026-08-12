import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '../contexto/Sesion'
import { useOrdenes } from '../hooks/useOrdenes'
import { mensajeDeError, supabase } from '../lib/supabase'
import {
  detectarSaltosDeFactura,
  formatearFecha,
  formatearUSD,
  TOLERANCIA_DESCUADRE_USD,
} from '../lib/reglas'
import { ETIQUETA_METODO, type Cierre as CierreRegistro, type MetodoPago, type TotalesCierre } from '../lib/tipos'
import { exportarExcel, liquidacionDesdeOrdenes } from '../lib/exportar'
import { Alerta, Boton, Cargando, ContenedorTabla, Dato, Entrada, Tarjeta } from '../componentes/UI'

export function Cierre() {
  const { hoy, esAdmin, usuario } = useSesion()
  const [fecha, setFecha] = useState(hoy)
  const { ordenes, cargando, recargar } = useOrdenes(fecha)
  const [cierre, setCierre] = useState<CierreRegistro | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const cargarCierre = useCallback(async () => {
    const { data } = await supabase.from('cierres').select('*').eq('fecha_operativa', fecha).maybeSingle()
    setCierre((data as CierreRegistro) ?? null)
  }, [fecha])

  useEffect(() => {
    void cargarCierre()
  }, [cargarCierre])

  // Los totales por forma de pago hay que sacarlos de la tabla `pagos`: la
  // vista de órdenes solo trae el total, no cómo se compuso.
  const [porMetodo, setPorMetodo] = useState<TotalesCierre['por_metodo']>({})

  useEffect(() => {
    async function cargar() {
      const ids = ordenes.map((o) => o.id)
      if (ids.length === 0) {
        setPorMetodo({})
        return
      }
      const { data } = await supabase.from('pagos').select('metodo, monto, moneda, orden_id').in('orden_id', ids)
      if (!data) return

      const tasaPorOrden = new Map(ordenes.map((o) => [o.id, Number(o.tasa_bs_por_usd)]))
      const resumen: TotalesCierre['por_metodo'] = {}

      for (const pago of data as Array<{ metodo: MetodoPago; monto: number; moneda: string; orden_id: string }>) {
        const fila = (resumen[pago.metodo] ??= { cantidad: 0, monto_bs: 0, monto_usd: 0 })
        const monto = Number(pago.monto)
        const tasa = tasaPorOrden.get(pago.orden_id) ?? 0
        fila.cantidad += 1
        if (pago.moneda === 'USD') {
          fila.monto_usd += monto
        } else {
          fila.monto_bs += monto
          if (tasa > 0) fila.monto_usd += monto / tasa
        }
      }
      setPorMetodo(resumen)
    }
    void cargar()
  }, [ordenes])

  const totales = useMemo(() => {
    const ventas = ordenes.reduce((s, o) => s + Number(o.monto_pedido_usd), 0)
    const cobrado = ordenes.reduce((s, o) => s + Number(o.tarifa_cliente_usd), 0)
    const pagado = ordenes.reduce((s, o) => s + Number(o.pago_repartidor_usd), 0)
    return {
      ordenes: ordenes.length,
      ventas_usd: ventas,
      delivery_cobrado_usd: cobrado,
      delivery_pagado_usd: pagado,
      margen_delivery_usd: cobrado - pagado,
      total_usd: ventas + cobrado,
      por_metodo: porMetodo,
    } satisfies TotalesCierre
  }, [ordenes, porMetodo])

  const conMargen = Math.abs(totales.margen_delivery_usd) >= 0.01

  const pendientes = ordenes.filter((o) => o.estado === 'pendiente')
  const sinRepartidor = ordenes.filter((o) => !o.repartidor_id)
  const descuadradas = ordenes.filter((o) => Math.abs(o.diferencia_usd) > TOLERANCIA_DESCUADRE_USD)
  const saltos = useMemo(() => detectarSaltosDeFactura(ordenes.map((o) => o.numero_factura)), [ordenes])

  // Se puede cerrar con descuadres (a veces son reales y se justifican), pero no
  // con órdenes sin verificar o sin repartidor: eso rompería la liquidación.
  const bloqueos: string[] = []
  if (pendientes.length > 0) bloqueos.push(`${pendientes.length} orden(es) sin verificar`)
  if (sinRepartidor.length > 0) bloqueos.push(`${sinRepartidor.length} orden(es) sin repartidor asignado`)

  async function cerrar() {
    if (!usuario) return
    if (!window.confirm(`¿Cerrar la jornada del ${formatearFecha(fecha)}? Después nadie podrá modificar estas órdenes.`))
      return

    setTrabajando(true)
    setError(null)
    const { error } = await supabase.from('cierres').insert({
      fecha_operativa: fecha,
      cerrado_por: usuario.id,
      totales,
    })
    if (error) setError(mensajeDeError(error))
    setTrabajando(false)
    await cargarCierre()
    await recargar()
  }

  async function reabrir() {
    if (!window.confirm(`¿Reabrir la jornada del ${formatearFecha(fecha)}?`)) return
    setTrabajando(true)
    setError(null)
    const { error } = await supabase.from('cierres').delete().eq('fecha_operativa', fecha)
    if (error) setError(mensajeDeError(error))
    setTrabajando(false)
    await cargarCierre()
    await recargar()
  }

  if (cargando) return <Cargando texto="Calculando el cierre…" />

  return (
    <div className="space-y-4">
      {error && <Alerta tono="error">{error}</Alerta>}

      <Tarjeta
        titulo={`Cierre — ${formatearFecha(fecha)}`}
        acciones={
          <>
            <Entrada
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="min-h-10 w-auto text-sm"
            />
            <Boton
              variante="secundario"
              className="min-h-10 text-sm"
              onClick={() =>
                void exportarExcel(ordenes, liquidacionDesdeOrdenes(ordenes), `delivery-${fecha}.xlsx`)
              }
            >
              Bajar Excel
            </Boton>
            <Boton variante="secundario" className="min-h-10 text-sm" onClick={() => window.print()}>
              Imprimir
            </Boton>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Dato etiqueta="Órdenes" valor={totales.ordenes} />
          <Dato etiqueta="Ventas (sin delivery)" valor={formatearUSD(totales.ventas_usd)} />
          <Dato etiqueta="Total facturado" valor={formatearUSD(totales.total_usd)} />
          <Dato
            etiqueta="Delivery cobrado"
            valor={formatearUSD(totales.delivery_cobrado_usd)}
            // Sin margen, cobrado y a pagar son la misma cifra: se dice una vez.
            detalle={conMargen ? undefined : 'Va completo a los repartidores'}
          />
          <Dato etiqueta="A pagar a repartidores" valor={formatearUSD(totales.delivery_pagado_usd)} tono="malo" />
          {conMargen && (
            <Dato etiqueta="Margen del delivery" valor={formatearUSD(totales.margen_delivery_usd)} tono="bueno" />
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Por forma de pago">
        <ContenedorTabla>
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Forma de pago</th>
                <th className="py-2 pr-3 text-right">Cantidad</th>
                <th className="py-2 pr-3 text-right">Bs</th>
                <th className="py-2 text-right">Equivalente $</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(porMetodo).map(([metodo, fila]) => (
                <tr key={metodo} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-semibold">{ETIQUETA_METODO[metodo as MetodoPago] ?? metodo}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fila.cantidad}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {fila.monto_bs > 0 ? fila.monto_bs.toFixed(2) : '—'}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatearUSD(fila.monto_usd)}</td>
                </tr>
              ))}
              {Object.keys(porMetodo).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    No hay pagos cargados en esta jornada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ContenedorTabla>
      </Tarjeta>

      {(saltos.length > 0 || descuadradas.length > 0 || bloqueos.length > 0) && (
        <Tarjeta titulo="Revisar antes de cerrar">
          <div className="space-y-3">
            {bloqueos.length > 0 && (
              <Alerta tono="error" titulo="Impide cerrar">
                <ul className="ml-4 list-disc">
                  {bloqueos.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </Alerta>
            )}
            {saltos.length > 0 && (
              <Alerta tono="aviso" titulo="Faltan facturas en el correlativo">
                No aparecen los números: {saltos.join(', ')}.
              </Alerta>
            )}
            {descuadradas.length > 0 && (
              <Alerta tono="aviso" titulo={`${descuadradas.length} orden(es) descuadrada(s)`}>
                <ul className="ml-4 list-disc">
                  {descuadradas.map((o) => (
                    <li key={o.id}>
                      Factura {o.numero_factura}: {o.diferencia_usd < 0 ? 'faltan' : 'sobran'}{' '}
                      {formatearUSD(Math.abs(o.diferencia_usd))}
                    </li>
                  ))}
                </ul>
              </Alerta>
            )}
          </div>
        </Tarjeta>
      )}

      <div className="no-imprimir">
        {cierre ? (
          <Alerta tono="exito" titulo="Jornada cerrada">
            <p>Se cerró el {new Date(cierre.cerrado_en).toLocaleString('es-VE')}. Las órdenes ya no se pueden modificar.</p>
            {esAdmin && (
              <Boton variante="secundario" className="mt-3 min-h-10 text-sm" onClick={() => void reabrir()} disabled={trabajando}>
                Reabrir jornada
              </Boton>
            )}
          </Alerta>
        ) : esAdmin ? (
          <Boton ancho onClick={() => void cerrar()} disabled={trabajando || bloqueos.length > 0}>
            {trabajando ? 'Cerrando…' : 'Cerrar la jornada'}
          </Boton>
        ) : (
          <Alerta tono="info">Solo la administradora puede cerrar la jornada.</Alerta>
        )}
      </div>
    </div>
  )
}

export default Cierre
