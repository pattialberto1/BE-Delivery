import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '../contexto/Sesion'
import { useOrdenes } from '../hooks/useOrdenes'
import { mensajeDeError, supabase } from '../lib/supabase'
import { detectarSaltosDeFactura, formatearFecha, formatearUSD, TOLERANCIA_DESCUADRE_USD } from '../lib/reglas'
import { ETIQUETA_ESTADO, type OrdenDetalle } from '../lib/tipos'
import { Alerta, Boton, Cargando, ContenedorTabla, Entrada, Insignia, Seleccion, Tarjeta, Vacio } from '../componentes/UI'

type Filtro = 'todas' | 'pendientes' | 'descuadradas' | 'sin_repartidor'

export function OrdenesDelDia() {
  const { hoy, repartidores, puedeEscribir, esAdmin } = useSesion()
  // Se puede mirar cualquier jornada, no solo la de hoy: al día siguiente hay
  // que poder revisar o corregir lo de ayer.
  const [fecha, setFecha] = useState(hoy)
  const { ordenes, cargando, error, recargar } = useOrdenes(fecha)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  // Selección para asignar varias de una vez: el repartidor casi nunca sale
  // con una sola comanda.
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())
  const [repartidorLote, setRepartidorLote] = useState('')

  const saltos = useMemo(() => detectarSaltosDeFactura(ordenes.map((o) => o.numero_factura)), [ordenes])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return ordenes.filter((o) => {
      if (filtro === 'pendientes' && o.estado !== 'pendiente') return false
      if (filtro === 'descuadradas' && Math.abs(o.diferencia_usd) <= TOLERANCIA_DESCUADRE_USD) return false
      if (filtro === 'sin_repartidor' && (o.repartidor_id || o.tipo === 'pickup')) return false
      if (!texto) return true
      return (
        o.numero_factura.toLowerCase().includes(texto) ||
        o.cliente_nombre.toLowerCase().includes(texto) ||
        (o.direccion ?? '').toLowerCase().includes(texto) ||
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

  /** Una orden se puede asignar mientras sea delivery y no esté verificada. */
  function seAsigna(o: OrdenDetalle) {
    return o.tipo !== 'pickup' && o.estado === 'pendiente'
  }

  async function asignarLote() {
    if (!repartidorLote || seleccionadas.size === 0) return
    setErrorAccion(null)
    const { error } = await supabase
      .from('ordenes')
      .update({ repartidor_id: repartidorLote })
      .in('id', [...seleccionadas])
    if (error) setErrorAccion(mensajeDeError(error))
    setSeleccionadas(new Set())
    setRepartidorLote('')
    await recargar()
  }

  function alternar(id: string) {
    setSeleccionadas((previas) => {
      const siguiente = new Set(previas)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
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

  const sinRepartidor = ordenes.filter((o) => !o.repartidor_id && o.tipo !== 'pickup').length
  const descuadradas = ordenes.filter((o) => Math.abs(o.diferencia_usd) > TOLERANCIA_DESCUADRE_USD).length

  const asignables = useMemo(() => visibles.filter((o) => seAsigna(o)), [visibles])

  if (cargando) return <Cargando texto="Cargando órdenes…" />

  return (
    <div className="space-y-4">
      {error && <Alerta tono="error">{error}</Alerta>}
      {errorAccion && <Alerta tono="error">{errorAccion}</Alerta>}

      {/* Lo que falta asignar se dice arriba y se puede filtrar de un toque:
          es el olvido que rompe la liquidación al cerrar el día. */}
      {sinRepartidor > 0 && (
        <Alerta tono="aviso" titulo={`${sinRepartidor} orden(es) sin repartidor`}>
          <p className="mb-2">Hay que asignarlas antes de cerrar la jornada.</p>
          <Boton variante="secundario" className="min-h-9 text-sm" onClick={() => setFiltro('sin_repartidor')}>
            Ver solo esas
          </Boton>
        </Alerta>
      )}

      {saltos.length > 0 && (
        <Alerta tono="aviso" titulo="Faltan facturas en el correlativo">
          No aparecen los números: {saltos.join(', ')}. Puede que esas comandas se hayan facturado en la tablet pero
          nunca se cargaran aquí.
        </Alerta>
      )}

      <Tarjeta
        titulo={
          fecha === hoy ? `Órdenes del día (${ordenes.length})` : `Órdenes del ${formatearFecha(fecha)} (${ordenes.length})`
        }
        acciones={
          <>
            <Entrada
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => {
                setFecha(e.target.value)
                setSeleccionadas(new Set())
              }}
              className="min-h-10 w-auto text-sm"
            />
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
                  <th className="py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas las que se pueden asignar"
                      className="h-5 w-5"
                      checked={asignables.length > 0 && seleccionadas.size === asignables.length}
                      onChange={(e) =>
                        setSeleccionadas(new Set(e.target.checked ? asignables.map((o) => o.id) : []))
                      }
                    />
                  </th>
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
                      <td className="py-2 pr-2">
                        {puedeEscribir && seAsigna(o) && (
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar la factura ${o.numero_factura}`}
                            className="h-5 w-5"
                            checked={seleccionadas.has(o.id)}
                            onChange={() => alternar(o.id)}
                          />
                        )}
                      </td>
                      <td className="py-2 pr-3 font-bold tabular-nums">
                        {puedeEscribir ? (
                          <Link
                            to={`/orden/${o.id}`}
                            title="Editar esta orden"
                            className="underline decoration-dotted underline-offset-4 hover:text-marca-700"
                          >
                            {o.numero_factura}
                          </Link>
                        ) : (
                          o.numero_factura
                        )}
                        {o.tipo === 'pickup' && (
                          <div className="mt-0.5">
                            <Insignia>Retiro</Insignia>
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-semibold">{o.cliente_nombre}</div>
                        <div className="text-xs text-slate-500">{o.direccion || <span className="italic">sin dirección</span>}</div>
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
                        {o.tipo === 'pickup' ? (
                          <span className="text-slate-400">—</span>
                        ) : puedeEscribir && o.estado === 'pendiente' ? (
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
                        <div className="flex justify-end gap-2">
                        {puedeEscribir && (
                          <Link
                            to={`/orden/${o.id}`}
                            className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </Link>
                        )}
                        {esAdmin && (
                          <Boton variante="peligro" onClick={() => void anular(o)} className="min-h-9 px-3 text-xs">
                            Anular
                          </Boton>
                        )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ContenedorTabla>
        )}
      </Tarjeta>

      {/* Barra de asignación en lote: aparece al seleccionar y queda fija abajo,
          al alcance del pulgar en la tablet. */}
      {seleccionadas.size > 0 && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border-2 border-marca-600 bg-white p-3 shadow-lg">
          <span className="font-bold text-slate-800">
            {seleccionadas.size} orden{seleccionadas.size === 1 ? '' : 'es'} seleccionada
            {seleccionadas.size === 1 ? '' : 's'}
          </span>
          <Seleccion
            value={repartidorLote}
            onChange={(e) => setRepartidorLote(e.target.value)}
            className="min-h-11 w-auto"
          >
            <option value="">— Elegir repartidor —</option>
            {repartidores
              .filter((r) => r.activo)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
          </Seleccion>
          <Boton disabled={!repartidorLote} onClick={() => void asignarLote()} className="min-h-11">
            Asignar
          </Boton>
          <Boton variante="fantasma" onClick={() => setSeleccionadas(new Set())} className="min-h-11">
            Cancelar
          </Boton>
        </div>
      )}
    </div>
  )
}

export default OrdenesDelDia
