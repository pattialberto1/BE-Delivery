import { useMemo, useState } from 'react'
import { useSesion } from '../contexto/Sesion'
import { useOrdenes } from '../hooks/useOrdenes'
import { mensajeDeError, supabase } from '../lib/supabase'
import { formatearUSD } from '../lib/reglas'
import type { OrdenDetalle } from '../lib/tipos'
import { Alerta, Boton, Cargando, Tarjeta, Vacio } from '../componentes/UI'

/**
 * Asignar el repartidor a las comandas listas.
 *
 * Está armada alrededor de cómo pasa de verdad en el local: los motorizados
 * tienen su propio orden de turnos, sube el que le toca, escoge una o dos
 * comandas y le dice a la cajera cuáles se lleva.
 *
 * Por eso el flujo es al revés que en un formulario: primero se toca al
 * repartidor que subió, y después sus comandas — cada toque la asigna al
 * instante. Sin desplegables, sin guardar, sin confirmar.
 */
export function Asignar() {
  const { hoy, repartidores, usuario } = useSesion()
  const { ordenes, cargando, error, recargar } = useOrdenes(hoy)
  const [repartidorId, setRepartidorId] = useState('')
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [ultima, setUltima] = useState<{ orden: OrdenDetalle; repartidor: string } | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)

  const activos = useMemo(() => repartidores.filter((r) => r.activo), [repartidores])

  const pendientes = useMemo(
    () =>
      ordenes
        .filter((o) => o.tipo !== 'pickup' && !o.repartidor_id)
        .sort((a, b) => a.numero_factura.localeCompare(b.numero_factura, 'es', { numeric: true })),
    [ordenes],
  )

  const elegido = activos.find((r) => r.id === repartidorId)

  async function asignar(orden: OrdenDetalle) {
    if (!elegido) return
    setTrabajando(orden.id)
    setErrorAccion(null)

    const { error } = await supabase.from('ordenes').update({ repartidor_id: elegido.id }).eq('id', orden.id)
    if (error) {
      setErrorAccion(mensajeDeError(error))
    } else {
      // Se guarda la última para poder deshacerla: con un toque por comanda, un
      // dedo mal puesto tiene que costar otro toque, no un viaje a otra pantalla.
      setUltima({ orden, repartidor: elegido.nombre })
    }
    setTrabajando(null)
    await recargar()
  }

  async function deshacer() {
    if (!ultima) return
    setErrorAccion(null)
    const { error } = await supabase.from('ordenes').update({ repartidor_id: null }).eq('id', ultima.orden.id)
    if (error) setErrorAccion(mensajeDeError(error))
    setUltima(null)
    await recargar()
  }

  if (cargando) return <Cargando texto="Cargando comandas…" />

  return (
    <div className="space-y-4">
      {error && <Alerta tono="error">{error}</Alerta>}
      {errorAccion && <Alerta tono="error">{errorAccion}</Alerta>}

      <Tarjeta titulo="1. ¿Quién subió?">
        {activos.length === 0 ? (
          <Alerta tono="aviso">
            No hay repartidores cargados. {usuario?.rol === 'admin' ? 'Agrégalos en Configuración.' : 'Pídeselo a la administradora.'}
          </Alerta>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activos.map((r) => (
              <button
                key={r.id}
                onClick={() => setRepartidorId(r.id === repartidorId ? '' : r.id)}
                className={`min-h-14 rounded-xl border-2 px-6 text-lg font-bold transition-colors ${
                  r.id === repartidorId
                    ? 'border-marca-600 bg-marca-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {r.nombre}
              </button>
            ))}
          </div>
        )}
      </Tarjeta>

      {ultima && (
        <Alerta tono="exito">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Factura <strong>{ultima.orden.numero_factura}</strong> asignada a <strong>{ultima.repartidor}</strong>.
            </span>
            <Boton variante="secundario" className="min-h-9 text-sm" onClick={() => void deshacer()}>
              Deshacer
            </Boton>
          </div>
        </Alerta>
      )}

      <Tarjeta titulo={`2. ¿Cuáles se lleva? (${pendientes.length} sin asignar)`}>
        {pendientes.length === 0 ? (
          <Vacio>Todas las comandas del día ya tienen repartidor.</Vacio>
        ) : !elegido ? (
          <Alerta tono="info">Toca arriba al repartidor que subió y después sus comandas.</Alerta>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Toca las comandas que se lleva <strong>{elegido.nombre}</strong>. Cada toque la asigna. Si se lleva dos,
              tócalas las dos.
            </p>

            {pendientes.map((o) => (
              <button
                key={o.id}
                disabled={trabajando === o.id}
                onClick={() => void asignar(o)}
                className="flex min-h-16 w-full items-center gap-4 rounded-xl border-2 border-slate-300 bg-white px-4
                  text-left transition-colors hover:border-marca-400 hover:bg-marca-50 active:bg-marca-100
                  disabled:opacity-50"
              >
                <span className="text-2xl font-black tabular-nums text-slate-800">{o.numero_factura}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-800">{o.cliente_nombre}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {o.zona}
                    {o.direccion ? ` · ${o.direccion}` : ''}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-1 font-bold tabular-nums text-slate-700">
                  {formatearUSD(o.tarifa_cliente_usd)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Tarjeta>
    </div>
  )
}

export default Asignar
