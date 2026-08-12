import { useMemo, useState } from 'react'
import { useSesion } from '../contexto/Sesion'
import { useOrdenes } from '../hooks/useOrdenes'
import { mensajeDeError, supabase } from '../lib/supabase'
import { detectarSaltosDeFactura, formatearUSD, TOLERANCIA_DESCUADRE_USD } from '../lib/reglas'
import { ETIQUETA_ESTADO, type OrdenDetalle } from '../lib/tipos'
import { Alerta, Boton, Cargando, ContenedorTabla, Insignia, Seleccion, Tarjeta, Vacio } from '../componentes/UI'

type Filtro = 'todas' | 'pendientes' | 'descuadradas' | 'sin_repartidor'

export function OrdenesDelDia() {
  const { hoy, repartidores, puedeEscribir, esAdmin } = useSesion()
  const { ordenes, cargando, error, recargar } = useOrdenes(hoy)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  const saltos = useMemo(() => detectarSaltosDeFactura(ordenes.map((o) => o.numero_factura)), [ordenes])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return ordenes.filter((o) => {
      if (filtro === 'pendientes' && o.estado !== 'pendiente') return false
      if (filtro === 'descuadradas' && Math.abs(o.diferencia_usd) <= TOLERANCIA_DESCUADRE_USD) return false
      if (filtro === 'sin_repartidor' && o.repartidor_id) return false
      if (!texto) return true
      return (
        o.numero_factura.toLowerCase().includes(texto) ||
        o.cliente_nombre.toLowerCase().includes(texto) ||
        o.direccion.toLowerCase().includes(texto) ||
        (o.repartidor ?? '').toLowerCase().includes(texto)
      )
    })
  }, [ordenes, filtro, busqueda])

  async function asignarRepartidor(orden: OrdenDetalle, repartidorId: string) {
    setErrorAccion(null)
    const { error } = await supabase
      .from('ordenes')
      .update({ repartidor_id: repartidorId || null })
      .eq('id', orden.id)
    if (error) setErrorAccion(mensajeDeError(error))
    await recargar()
  }

  async function anular(orden: OrdenDetalle) {
    const motivo = window.prompt(`Anular la factura ${orden.numero_factura}. ¿Motivo?`)
    if (!motivo?.trim()) return
    setErrorAccion(null)
    const { error } = await supabase
      .from('ordenes')
      .update({ estado: 'anulada', motivo_anulacion: motivo.trim() })
      .eq('id', orden.id)
    if (error) setErrorAccion(mensajeDeError(error))
    await recargar()
  }

  const sinRepartidor = ordenes.filter((o) => !o.repartidor_id).length
  const descuadradas = ordenes.filter((o) => Math.abs(o.diferencia_usd) > TOLERANCIA_DESCUADRE_USD).length

  if (cargando) return <Cargando texto="Cargando órdenes…" />

  return (
    <div className="space-y-4">
      {error && <Alerta tono="error">{error}</Alerta>}
      {errorAccion && <Alerta tono="error">{errorAccion}</Alerta>}

      {saltos.length > 0 && (
        <Alerta tono="aviso" titulo="Faltan facturas en el correlativo">
          No aparecen los números: {saltos.join(', ')}. Puede que esas comandas se hayan facturado en la tablet pero
          nunca se cargaran aquí.
        </Alerta>
      )}

      <Tarjeta
        titulo={`Órdenes del día (${ordenes.length})`}
        acciones={
          <>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar factura, cliente…"
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <Seleccion
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as Filtro)}
              className="min-h-10 w-auto text-sm"
            >
              <option value="todas">Todas</option>
              <option value="pendientes">Pendientes</option>
              <option value="descuadradas">Descuadradas ({descuadradas})</option>
              <option value="sin_repartidor">Sin repartidor ({sinRepartidor})</option>
            </Seleccion>
            <Boton variante="secundario" onClick={() => void recargar()} className="min-h-10 text-sm">
              Actualizar
            </Boton>
          </>
        }
      >
        {visibles.length === 0 ? (
          <Vacio>No hay órdenes que coincidan.</Vacio>
        ) : (
          <ContenedorTabla>
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Factura</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Zona</th>
                  <th className="py-2 pr-3 text-right">Pedido</th>
                  <th className="py-2 pr-3 text-right">Delivery</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Pagado</th>
                  <th className="py-2 pr-3">Repartidor</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((o) => {
                  const cuadra = Math.abs(o.diferencia_usd) <= TOLERANCIA_DESCUADRE_USD
                  return (
                    <tr key={o.id} className="border-b border-slate-100 align-middle">
                      <td className="py-2 pr-3 font-bold tabular-nums">{o.numero_factura}</td>
                      <td className="py-2 pr-3">
                        <div className="font-semibold">{o.cliente_nombre}</div>
                        <div className="text-xs text-slate-500">{o.direccion}</div>
                      </td>
                      <td className="py-2 pr-3">{o.zona}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatearUSD(o.monto_pedido_usd)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatearUSD(o.tarifa_cliente_usd)}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatearUSD(o.total_usd)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${cuadra ? '' : 'font-bold text-red-700'}`}>
                        {formatearUSD(o.pagado_usd)}
                        {!cuadra && (
                          <div className="text-xs font-semibold">
                            {o.diferencia_usd < 0 ? 'faltan ' : 'sobran '}
                            {formatearUSD(Math.abs(o.diferencia_usd))}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {puedeEscribir && o.estado === 'pendiente' ? (
                          <Seleccion
                            value={o.repartidor_id ?? ''}
                            onChange={(e) => void asignarRepartidor(o, e.target.value)}
                            className="min-h-9 w-auto text-sm"
                          >
                            <option value="">— Sin asignar —</option>
                            {repartidores
                              .filter((r) => r.activo)
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.nombre}
                                </option>
                              ))}
                          </Seleccion>
                        ) : (
                          (o.repartidor ?? <Insignia tono="alerta">Sin asignar</Insignia>)
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Insignia tono={o.estado}>{ETIQUETA_ESTADO[o.estado]}</Insignia>
                      </td>
                      <td className="py-2">
                        {esAdmin && (
                          <Boton variante="peligro" onClick={() => void anular(o)} className="min-h-9 px-3 text-xs">
                            Anular
                          </Boton>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ContenedorTabla>
        )}
      </Tarjeta>
    </div>
  )
}

export default OrdenesDelDia
