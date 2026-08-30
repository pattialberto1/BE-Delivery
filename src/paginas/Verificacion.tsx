import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '../contexto/Sesion'
import { useOrdenes } from '../hooks/useOrdenes'
import { mensajeDeError, supabase, urlDeCaptura } from '../lib/supabase'
import { formatearFecha, formatearMonto, formatearUSD, TOLERANCIA_DESCUADRE_USD } from '../lib/reglas'
import { ETIQUETA_METODO, ETIQUETA_MONEDA_FACTURADA, type Pago } from '../lib/tipos'
import { Alerta, Boton, Cargando, Dato, Entrada, Insignia, Tarjeta, Vacio } from '../componentes/UI'

/**
 * Verificación de la administradora.
 *
 * Esto reemplaza el cotejo contra el papel impreso: en vez de leer la comanda,
 * buscar la fila en el Excel y comparar tres números, ve la captura del pago al
 * lado de lo que se tecleó y aprueba con un botón.
 */
export function Verificacion() {
  const { hoy, usuario, cuentas } = useSesion()
  // También se puede verificar lo de días anteriores: si quedó algo pendiente
  // de ayer, hay que poder llegar a ello.
  const [fecha, setFecha] = useState(hoy)
  const { ordenes, cargando, recargar } = useOrdenes(fecha)
  const [pagosPorOrden, setPagosPorOrden] = useState<Record<string, Pago[]>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [indice, setIndice] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const abreviaturaDeCuenta = useCallback(
    (cuentaId: string) => cuentas.find((c) => c.id === cuentaId)?.abreviatura ?? '—',
    [cuentas],
  )

  const pendientes = useMemo(() => ordenes.filter((o) => o.estado === 'pendiente'), [ordenes])
  const verificadas = ordenes.length - pendientes.length
  const actual = pendientes[Math.min(indice, Math.max(pendientes.length - 1, 0))]

  const cargarPagos = useCallback(async (ordenId: string) => {
    const { data, error } = await supabase.from('pagos').select('*').eq('orden_id', ordenId).order('creado_en')
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    const pagos = (data ?? []) as Pago[]
    setPagosPorOrden((previo) => ({ ...previo, [ordenId]: pagos }))

    // El bucket es privado: cada captura necesita su URL firmada temporal.
    const firmadas = await Promise.all(
      pagos.map(async (p) => (p.imagen_path ? ([p.id, await urlDeCaptura(p.imagen_path)] as const) : null)),
    )
    setUrls((previo) => {
      const siguiente = { ...previo }
      for (const par of firmadas) {
        if (par?.[1]) siguiente[par[0]] = par[1]
      }
      return siguiente
    })
  }, [])

  useEffect(() => {
    if (actual && !pagosPorOrden[actual.id]) void cargarPagos(actual.id)
  }, [actual, pagosPorOrden, cargarPagos])

  async function verificar() {
    if (!actual || !usuario) return
    setTrabajando(true)
    setError(null)
    const { error } = await supabase
      .from('ordenes')
      .update({ estado: 'verificada', verificada_por: usuario.id, verificada_en: new Date().toISOString() })
      .eq('id', actual.id)

    if (error) setError(mensajeDeError(error))
    setTrabajando(false)
    await recargar()
  }

  const pagos = actual ? (pagosPorOrden[actual.id] ?? []) : []
  // La facturada aparte no lleva pagos acá —se cobró por la caja del local—,
  // así que no tiene nada que cuadrar ni captura que mirar.
  const cuadra = actual
    ? actual.facturada_aparte || Math.abs(actual.diferencia_usd) <= TOLERANCIA_DESCUADRE_USD
    : true

  // El selector de fecha va fuera de todo lo que pueda faltar: si no, al no
  // quedar nada pendiente no habría forma de moverse a otro día.
  const barraFecha = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Entrada
          type="date"
          value={fecha}
          max={hoy}
          onChange={(e) => {
            setFecha(e.target.value)
            setIndice(0)
          }}
          className="min-h-10 w-auto text-sm"
        />
        <p className="font-semibold text-slate-700">
          Verificadas {verificadas} de {ordenes.length}
          {pendientes.length > 0 && ` · quedan ${pendientes.length}`}
        </p>
      </div>
    </div>
  )

  if (cargando) return <Cargando texto="Cargando órdenes por verificar…" />

  if (!actual) {
    return (
      <div className="space-y-4">
        {barraFecha}
        <Tarjeta titulo={`Verificación — ${formatearFecha(fecha)}`}>
          {ordenes.length === 0 ? (
            <Vacio>No hay órdenes cargadas en esta jornada.</Vacio>
          ) : (
            <Alerta tono="exito" titulo="Todo verificado">
              No queda ninguna orden pendiente. Se verificaron las {ordenes.length} de la jornada.
            </Alerta>
          )}
        </Tarjeta>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <Alerta tono="error">{error}</Alerta>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {barraFecha}
        <div className="flex gap-2">
          <Boton
            variante="secundario"
            className="min-h-10 text-sm"
            disabled={indice === 0}
            onClick={() => setIndice((i) => Math.max(0, i - 1))}
          >
            ← Anterior
          </Boton>
          <Boton
            variante="secundario"
            className="min-h-10 text-sm"
            disabled={indice >= pendientes.length - 1}
            onClick={() => setIndice((i) => Math.min(pendientes.length - 1, i + 1))}
          >
            Saltar →
          </Boton>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Izquierda: lo que se tecleó */}
        <Tarjeta titulo={`Factura ${actual.numero_factura}`}>
          <dl className="space-y-2 text-sm">
            <Renglon termino="Cliente" valor={actual.cliente_nombre} />
            <Renglon termino="Teléfono" valor={actual.cliente_telefono ?? '—'} />
            <Renglon termino="Dirección" valor={actual.direccion || "— mandó el location —"} />
            <Renglon termino="Zona" valor={`${actual.zona} · ${formatearUSD(actual.tarifa_cliente_usd)}`} />
            <Renglon termino="Repartidor" valor={actual.repartidor ?? '⚠ Sin asignar'} />
            <Renglon termino="Cargada por" valor={actual.cargada_por ?? '—'} />
            {actual.notas && <Renglon termino="Notas" valor={actual.notas} />}
          </dl>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Dato etiqueta="Pedido" valor={formatearUSD(actual.monto_pedido_usd)} />
            <Dato etiqueta="Total" valor={formatearUSD(actual.total_usd)} />
            {actual.facturada_aparte ? (
              <Dato etiqueta="Cobro" valor="Por caja" detalle="No entra en la caja del delivery" />
            ) : (
              <Dato
                etiqueta="Pagado"
                valor={formatearUSD(actual.pagado_usd)}
                tono={cuadra ? 'bueno' : 'malo'}
                detalle={cuadra ? 'Cuadra' : `Diferencia ${formatearUSD(actual.diferencia_usd)}`}
              />
            )}
          </div>

          {!cuadra && (
            <Alerta tono="aviso" className="mt-3">
              Lo pagado no coincide con el total. Revisa antes de aprobar.
            </Alerta>
          )}

          {!actual.repartidor_id && (
            <Alerta tono="aviso" className="mt-3">
              Sin repartidor asignado. Esta carrera no va a aparecer en la liquidación de nadie.
            </Alerta>
          )}
        </Tarjeta>

        {/* Derecha: los comprobantes */}
        <Tarjeta
          titulo={actual.facturada_aparte ? 'Comprobantes' : `Comprobantes (${pagos.length})`}
        >
          <div className="space-y-4">
            {actual.facturada_aparte && (
              <Alerta tono="info" titulo="Se facturó aparte por caja">
                <p>
                  Esta comanda salió con factura fiscal por la caja del local, así que acá no hay captura que
                  cotejar. Lo que se aprueba es que la comanda existió y que la lleva el repartidor indicado.
                </p>
                <p className="mt-1">
                  No suma en ningún total del cierre. Lo único que genera es la carrera de{' '}
                  <strong>{formatearUSD(actual.pago_repartidor_usd)}</strong> que hay que pagarle,{' '}
                  {actual.moneda_facturada ? (
                    <>
                      con la plata de un cobro en{' '}
                      <strong>{ETIQUETA_MONEDA_FACTURADA[actual.moneda_facturada].toLowerCase()}</strong>.
                    </>
                  ) : (
                    <strong>sin que se haya dicho con qué moneda cobraron</strong>
                  )}
                </p>
              </Alerta>
            )}
            {pagos.map((pago) => (
              <div key={pago.id} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Insignia>{ETIQUETA_METODO[pago.metodo]}</Insignia>
                  <span className="font-bold tabular-nums">{formatearMonto(Number(pago.monto), pago.moneda)}</span>
                  {/* En qué cuenta cayó: es lo que dice en cuál banco entrar
                      a confirmarlo, igual que la columna "BANCO" del papel. */}
                  {pago.cuenta_id && <Insignia tono="neutro">{abreviaturaDeCuenta(pago.cuenta_id)}</Insignia>}
                </div>
                <dl className="space-y-1 text-sm">
                  <Renglon termino="Referencia" valor={pago.referencia ?? '—'} />
                  <Renglon termino="Emisor" valor={pago.emisor ?? '—'} />
                </dl>
                {pago.imagen_path ? (
                  urls[pago.id] ? (
                    <a href={urls[pago.id]} target="_blank" rel="noreferrer">
                      <img
                        src={urls[pago.id]}
                        alt={`Captura del pago ${pago.referencia ?? ''}`}
                        className="mt-2 max-h-96 w-full rounded-md border border-slate-300 object-contain"
                      />
                    </a>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">Cargando captura…</p>
                  )
                ) : (
                  <p className="mt-2 text-sm font-semibold text-amber-700">Sin captura adjunta.</p>
                )}
              </div>
            ))}
            {pagos.length === 0 && !actual.facturada_aparte && (
              <Vacio>Esta orden no tiene pagos cargados.</Vacio>
            )}
          </div>
        </Tarjeta>
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-slate-300 bg-white p-3">
        <Boton ancho onClick={() => void verificar()} disabled={trabajando}>
          {trabajando ? 'Guardando…' : '✓ Verificar y pasar a la siguiente'}
        </Boton>
      </div>
    </div>
  )
}

function Renglon({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 font-semibold text-slate-500">{termino}</dt>
      <dd className="flex-1 break-words text-slate-900">{valor}</dd>
    </div>
  )
}

export default Verificacion
