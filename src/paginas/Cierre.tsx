import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '../contexto/Sesion'
import { useOrdenes } from '../hooks/useOrdenes'
import { mensajeDeError, supabase } from '../lib/supabase'
import {
  detectarSaltosDeFactura,
  formatearBS,
  formatearFecha,
  formatearUSD,
  TOLERANCIA_DESCUADRE_USD,
} from '../lib/reglas'
import {
  ETIQUETA_METODO,
  ETIQUETA_MONEDA_FACTURADA,
  type Cierre as CierreRegistro,
  type MonedaFacturada,
  type MetodoPago,
  type Pago,
  type TotalesCierre,
} from '../lib/tipos'
import { exportarCierre } from '../lib/exportar'
import { Alerta, Boton, Cargando, ContenedorTabla, Dato, Entrada, Insignia, Tarjeta } from '../componentes/UI'

export function Cierre() {
  const { hoy, esAdmin, usuario, bancos, cuentas } = useSesion()
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

  // Los pagos hay que traerlos de su tabla: la vista de órdenes solo trae el
  // total, no cómo se compuso ni con qué referencia entró cada uno.
  const [pagos, setPagos] = useState<Pago[]>([])

  useEffect(() => {
    async function cargar() {
      const ids = ordenes.map((o) => o.id)
      if (ids.length === 0) {
        setPagos([])
        return
      }
      const { data } = await supabase.from('pagos').select('*').in('orden_id', ids).order('creado_en')
      setPagos((data as Pago[]) ?? [])
    }
    void cargar()
  }, [ordenes])

  const porMetodo = useMemo(() => {
    const tasaPorOrden = new Map(ordenes.map((o) => [o.id, Number(o.tasa_bs_por_usd)]))
    // Una facturada aparte no debería tener pagos cargados acá, pero si alguien
    // marca la casilla después de haberlos cargado, no pueden colarse en la caja.
    const deLaCaja = new Set(ordenes.filter((o) => !o.facturada_aparte).map((o) => o.id))
    const resumen: TotalesCierre['por_metodo'] = {}

    for (const pago of pagos.filter((p) => deLaCaja.has(p.orden_id))) {
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
    return resumen
  }, [ordenes, pagos])

  /**
   * Cada pago con su factura, su cliente y los nombres de cuenta y banco.
   *
   * El pago solo guarda identificadores y la vista de órdenes no trae pagos, así
   * que el cruce se hace acá. Va ordenado por correlativo de factura, que es
   * como se revisa contra el banco, y sirve igual para la tabla en pantalla y
   * para la hoja del Excel.
   */
  const pagosDelDia = useMemo(() => {
    const nombreCuenta = new Map(cuentas.map((c) => [c.id, c.nombre]))
    const nombreBanco = new Map(bancos.map((b) => [b.id, b.nombre]))
    const porId = new Map(ordenes.map((o) => [o.id, o]))

    return pagos
      .map((pago) => ({
        ...pago,
        monto: Number(pago.monto),
        cuenta: pago.cuenta_id ? (nombreCuenta.get(pago.cuenta_id) ?? null) : null,
        banco: pago.banco_id ? (nombreBanco.get(pago.banco_id) ?? null) : null,
        factura: porId.get(pago.orden_id)?.numero_factura ?? '',
        cliente: porId.get(pago.orden_id)?.cliente_nombre ?? '',
      }))
      .sort((a, b) => a.factura.localeCompare(b.factura, 'es', { numeric: true }))
  }, [pagos, cuentas, bancos, ordenes])

  // Las facturadas aparte se cobraron por la caja del local: se separan antes de
  // sumar nada, porque su plata no está en esta caja.
  const facturadas = useMemo(() => ordenes.filter((o) => o.facturada_aparte), [ordenes])
  const deLaCaja = useMemo(() => ordenes.filter((o) => !o.facturada_aparte), [ordenes])

  // Los pick up entran en la caja pero no son delivery: no llevan tarifa ni
  // repartidor, así que no pueden contarse como carreras.
  const deliveries = useMemo(() => deLaCaja.filter((o) => o.tipo !== 'pickup'), [deLaCaja])
  const pickups = useMemo(() => deLaCaja.filter((o) => o.tipo === 'pickup'), [deLaCaja])

  const totales = useMemo(() => {
    const suma = (lista: typeof ordenes, campo: 'monto_pedido_usd' | 'tarifa_cliente_usd' | 'pago_repartidor_usd') =>
      lista.reduce((s, o) => s + Number(o[campo]), 0)

    const ventas = suma(deLaCaja, 'monto_pedido_usd')
    const cobrado = suma(deLaCaja, 'tarifa_cliente_usd')
    const pagadoCaja = suma(deLaCaja, 'pago_repartidor_usd')
    const pagadoFacturadas = suma(facturadas, 'pago_repartidor_usd')

    return {
      ordenes: deLaCaja.length,
      ventas_usd: ventas,
      delivery_cobrado_usd: cobrado,
      // Incluye las facturadas aparte a propósito: es plata que sale, no que
      // entra, y al repartidor hay que pagarle esa carrera igual. Si esta cifra
      // las dejara fuera, no cuadraría con la liquidación con la que se paga.
      delivery_pagado_usd: pagadoCaja + pagadoFacturadas,
      // El margen se calcula solo con lo de la caja: lo facturado aparte no
      // cobró su delivery acá, y mezclarlo mostraría una pérdida que no existe.
      margen_delivery_usd: cobrado - pagadoCaja,
      total_usd: ventas + cobrado,
      por_metodo: porMetodo,
      facturadas_aparte: facturadas.length
        ? {
            ordenes: facturadas.length,
            ventas_usd: suma(facturadas, 'monto_pedido_usd'),
            delivery_cobrado_usd: suma(facturadas, 'tarifa_cliente_usd'),
            delivery_pagado_usd: pagadoFacturadas,
          }
        : undefined,
    } satisfies TotalesCierre
  }, [deLaCaja, facturadas, porMetodo])

  const conMargen = Math.abs(totales.margen_delivery_usd) >= 0.01

  // La tasa sale de las propias órdenes, no de la configuración de hoy: así el
  // reporte de un día viejo muestra la tasa con la que realmente se cobró.
  const tasaDelDia = ordenes.length ? Number(ordenes[0].tasa_bs_por_usd) : 0

  const pendientes = ordenes.filter((o) => o.estado === 'pendiente')
  // Una facturada aparte también la lleva alguien: entra en este control aunque
  // no entre en los totales de la caja.
  const sinRepartidor = ordenes.filter((o) => o.tipo !== 'pickup' && !o.repartidor_id)
  // Y queda fuera del descuadre: no tiene pagos cargados acá porque no le
  // corresponden, así que marcarla como descuadrada sería ruido en cada cierre.
  const descuadradas = deLaCaja.filter((o) => Math.abs(o.diferencia_usd) > TOLERANCIA_DESCUADRE_USD)
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
              disabled={ordenes.length === 0}
              onClick={() => void exportarCierre(fecha, ordenes, totales, tasaDelDia, pagosDelDia)}
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
          <Dato
            etiqueta="Órdenes en caja"
            valor={totales.ordenes}
            detalle={
              [
                pickups.length ? `${deliveries.length} delivery · ${pickups.length} pick up` : null,
                facturadas.length ? `+ ${facturadas.length} facturada(s) aparte` : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
          <Dato etiqueta="Ventas (sin delivery)" valor={formatearUSD(totales.ventas_usd)} />
          <Dato etiqueta="Total facturado" valor={formatearUSD(totales.total_usd)} />
          <Dato
            etiqueta="Delivery cobrado"
            valor={formatearUSD(totales.delivery_cobrado_usd)}
            // Sin margen, cobrado y a pagar son la misma cifra: se dice una vez.
            detalle={conMargen ? undefined : 'Va completo a los repartidores'}
          />
          <Dato
            etiqueta="A pagar a repartidores"
            valor={formatearUSD(totales.delivery_pagado_usd)}
            tono="malo"
            // Sale plata, no entra: por eso esta sí incluye las carreras de las
            // facturadas aparte. Se dice para que nadie crea que se coló.
            detalle={
              totales.facturadas_aparte
                ? `incluye ${formatearUSD(totales.facturadas_aparte.delivery_pagado_usd)} de facturadas aparte`
                : undefined
            }
          />
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
                    {fila.monto_bs > 0 ? formatearBS(fila.monto_bs) : '—'}
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

      {/*
        La lista de referencias es lo que reemplaza a la hoja de papel: la
        administradora entra al banco, busca la referencia y la tacha. Por eso
        va en la pantalla y no solo en el Excel — esta pantalla se imprime.
      */}
      <Tarjeta titulo={`Pagos recibidos (${pagos.length})`}>
        <ContenedorTabla>
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Factura</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Forma de pago</th>
                <th className="py-2 pr-3">Cuenta</th>
                <th className="py-2 pr-3">Banco del cliente</th>
                <th className="py-2 pr-3">Referencia</th>
                <th className="py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {pagosDelDia.map((pago) => (
                <tr key={pago.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-semibold tabular-nums">{pago.factura}</td>
                  <td className="py-2 pr-3">{pago.cliente}</td>
                  <td className="py-2 pr-3">{ETIQUETA_METODO[pago.metodo] ?? pago.metodo}</td>
                  <td className="py-2 pr-3 text-slate-600">{pago.cuenta ?? '—'}</td>
                  <td className="py-2 pr-3 text-slate-600">{pago.banco ?? '—'}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">
                    {pago.referencia ?? <span className="font-sans text-slate-400">—</span>}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {pago.moneda === 'USD' ? formatearUSD(pago.monto) : formatearBS(pago.monto)}
                  </td>
                </tr>
              ))}
              {pagos.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No hay pagos cargados en esta jornada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ContenedorTabla>
      </Tarjeta>

      {/*
        Las comandas facturadas por la caja del local. Van completamente aparte:
        su plata no está en esta caja y no suma en ninguna cifra de arriba. Lo
        único que sale de acá es la carrera que hay que pagarle al repartidor.
      */}
      {facturadas.length > 0 && (
        <Tarjeta titulo={`Facturadas aparte por caja (${facturadas.length})`}>
          <Alerta tono="aviso" titulo="No suman en la caja del delivery">
            Estas comandas se cobraron por la caja del local y salieron con factura fiscal. Sus montos{' '}
            <strong>no entran</strong> en ningún total del cierre. Lo único que cuenta es la carrera de cada una, que
            sí hay que pagarle al repartidor que la llevó.
          </Alerta>

          <ContenedorTabla className="mt-3">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Factura fiscal</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Zona</th>
                  <th className="py-2 pr-3">Repartidor</th>
                  <th className="py-2 pr-3">Pagó en</th>
                  <th className="py-2 pr-3 text-right">Pedido (no suma)</th>
                  <th className="py-2 text-right">Carrera a pagar</th>
                </tr>
              </thead>
              <tbody>
                {facturadas.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-bold tabular-nums">{o.numero_factura}</td>
                    <td className="py-2 pr-3">{o.cliente_nombre}</td>
                    <td className="py-2 pr-3">{o.zona}</td>
                    <td className="py-2 pr-3">
                      {o.repartidor ?? <Insignia tono="alerta">Sin asignar</Insignia>}
                    </td>
                    <td className="py-2 pr-3">
                      {o.moneda_facturada ? (
                        <>
                          {ETIQUETA_MONEDA_FACTURADA[o.moneda_facturada]}
                          {o.moneda_facturada === 'MIXTO' && (
                            <div className="text-xs text-slate-500">
                              {Number(o.facturada_bs) > 0 || Number(o.facturada_divisa_usd) > 0 ? (
                                `${formatearBS(Number(o.facturada_bs) || 0)} + ${formatearUSD(
                                  Number(o.facturada_divisa_usd) || 0,
                                )}`
                              ) : (
                                <span className="font-semibold text-red-700">sin desglosar</span>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <Insignia tono="alerta">Sin especificar</Insignia>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">
                      {formatearUSD(o.monto_pedido_usd)}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {formatearUSD(o.pago_repartidor_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold">
                  <td className="py-2 pr-3" colSpan={5}>
                    Solo esto se paga
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-400">—</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatearUSD(totales.facturadas_aparte?.delivery_pagado_usd ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </ContenedorTabla>

          {/* Con qué plata hay que pagar esas carreras: la moneda con la que
              cobró la otra caja es la que decide de dónde sale. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(['BS', 'USD', 'MIXTO'] as MonedaFacturada[]).map((m) => {
              const suyas = facturadas.filter((o) => o.moneda_facturada === m)
              if (suyas.length === 0) return null
              return (
                <Dato
                  key={m}
                  etiqueta={`Cobradas en ${ETIQUETA_MONEDA_FACTURADA[m].toLowerCase()}`}
                  valor={formatearUSD(suyas.reduce((s, o) => s + Number(o.pago_repartidor_usd), 0))}
                  detalle={
                    m === 'MIXTO'
                      ? `${suyas.length} carrera${suyas.length === 1 ? '' : 's'} · cobraron ${formatearBS(
                          suyas.reduce((s, o) => s + (Number(o.facturada_bs) || 0), 0),
                        )} + ${formatearUSD(suyas.reduce((s, o) => s + (Number(o.facturada_divisa_usd) || 0), 0))}`
                      : `${suyas.length} carrera${suyas.length === 1 ? '' : 's'} por pagar`
                  }
                />
              )
            })}
          </div>
        </Tarjeta>
      )}

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
