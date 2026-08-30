import { useMemo, useState } from 'react'
import { useSesion } from '../contexto/Sesion'
import { useOrdenesRango } from '../hooks/useOrdenes'
import { formatearFecha, formatearUSD } from '../lib/reglas'
import {
  carrerasPorMoneda,
  consolidarLiquidacion,
  exportarLiquidacion,
  hayMargenDeDelivery,
  liquidacionDesdeOrdenes,
  pagoPorMoneda,
} from '../lib/exportar'
import { ETIQUETA_MONEDA_FACTURADA, type MonedaFacturada } from '../lib/tipos'
import { Alerta, Boton, Cargando, ContenedorTabla, Dato, Entrada, Tarjeta, Vacio } from '../componentes/UI'

/**
 * Celda de una columna por moneda: el monto en dólares arriba y cuántas
 * carreras lo componen debajo.
 *
 * El monto es lo que se paga, así que va primero; el conteo está para que el
 * repartidor pueda cotejarlo contra sus carreras.
 */
function CeldaMoneda({ carreras, pagar }: { carreras: number; pagar: number }) {
  if (carreras === 0) return <td className="py-2.5 pr-3 text-right text-slate-400">—</td>
  return (
    <td className="py-2.5 pr-3 text-right tabular-nums">
      <div className="font-semibold text-slate-800">{formatearUSD(pagar)}</div>
      <div className="text-xs font-normal text-slate-500">
        {carreras} carrera{carreras === 1 ? '' : 's'}
      </div>
    </td>
  )
}

/**
 * Liquidación de repartidores.
 *
 * Es el tercer cuadro que hoy se arma a mano al final del día: cuántas carreras
 * hizo cada quien y cuánto se le debe. Aquí sale solo, y por rango de fechas
 * para poder pagar la semana completa de una vez.
 */
export function Liquidacion() {
  const { hoy } = useSesion()
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const { ordenes, cargando, error } = useOrdenesRango(desde, hasta)

  const porDia = useMemo(() => liquidacionDesdeOrdenes(ordenes), [ordenes])
  const consolidado = useMemo(() => consolidarLiquidacion(porDia), [porDia])
  // Los retiros en el local no llevan repartidor por definición: contarlos aquí
  // haría creer que falta asignarlos.
  const sinAsignar = useMemo(
    () => ordenes.filter((o) => !o.repartidor_id && o.tipo !== 'pickup'),
    [ordenes],
  )

  const totalPagar = consolidado.reduce((s, f) => s + f.total_pagar_usd, 0)
  const totalCobrado = consolidado.reduce((s, f) => s + f.total_cobrado_usd, 0)
  const totalCarreras = consolidado.reduce((s, f) => s + f.carreras, 0)

  // Con el esquema actual el repartidor cobra el delivery completo, así que
  // «cobrado» y «a pagar» son la misma cifra. Se muestran solo si difieren.
  const conMargen = useMemo(() => hayMargenDeDelivery(consolidado), [consolidado])

  // Con qué plata se cobró cada carrera: al repartidor se le paga con lo que
  // entró, así que hay que poder separar las de dólares de las de bolívares.
  // Las anuladas quedan fuera, igual que en el total a pagar; contarlas aquí
  // haría que las columnas por moneda no sumaran las carreras de la fila.
  const entregas = useMemo(
    () => ordenes.filter((o) => o.tipo !== 'pickup' && o.repartidor_id && o.estado !== 'anulada'),
    [ordenes],
  )
  const desglosePorRepartidor = useMemo(() => {
    const mapa = new Map<string, { carreras: ReturnType<typeof carrerasPorMoneda>; pagar: ReturnType<typeof pagoPorMoneda> }>()
    for (const fila of consolidado) {
      const suyas = entregas.filter((o) => o.repartidor_id === fila.repartidor_id)
      mapa.set(fila.repartidor_id, { carreras: carrerasPorMoneda(suyas), pagar: pagoPorMoneda(suyas) })
    }
    return mapa
  }, [consolidado, entregas])
  const totalMonedas = useMemo(() => carrerasPorMoneda(entregas), [entregas])
  const totalPorMoneda = useMemo(() => pagoPorMoneda(entregas), [entregas])

  // Las mixtas (parte pago móvil, parte dólares) y las que aún no tienen pago
  // cargado solo ocupan columna si existen; si no, serían una columna de rayas.
  const mixtas = totalMonedas.MIXTO + totalMonedas.SIN_PAGO
  const pagarMixtas = totalPorMoneda.MIXTO + totalPorMoneda.SIN_PAGO
  // Las facturadas por la caja del local llevan columna propia: su carrera se
  // paga igual, pero con plata que no está en la caja del delivery.
  const facturadas = totalMonedas.FACTURADA
  const pagarFacturadas = totalPorMoneda.FACTURADA

  const detalleFacturadas = useMemo(() => {
    const suyas = entregas.filter((o) => o.facturada_aparte)
    const partes = (['BS', 'USD', 'MIXTO'] as MonedaFacturada[])
      .map((m) => {
        const cuantas = suyas.filter((o) => o.moneda_facturada === m).length
        return cuantas ? `${cuantas} en ${ETIQUETA_MONEDA_FACTURADA[m].toLowerCase()}` : null
      })
      .filter(Boolean)
    const sinDecir = suyas.filter((o) => !o.moneda_facturada).length
    if (sinDecir) partes.push(`${sinDecir} sin especificar`)
    return partes.join(' · ')
  }, [entregas])

  const unSoloDia = desde === hasta

  return (
    <div className="space-y-4">
      {error && <Alerta tono="error">{error}</Alerta>}

      <Tarjeta
        titulo="Liquidación de repartidores"
        acciones={
          <>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              Desde
              <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="min-h-10 w-auto text-sm" />
            </label>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              Hasta
              <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="min-h-10 w-auto text-sm" />
            </label>
            <Boton
              variante="secundario"
              className="min-h-10 text-sm"
              disabled={ordenes.length === 0}
              onClick={() => void exportarLiquidacion(desde, hasta, ordenes)}
            >
              Bajar Excel
            </Boton>
            <Boton variante="secundario" className="min-h-10 text-sm" onClick={() => window.print()}>
              Imprimir
            </Boton>
          </>
        }
      >
        {cargando ? (
          <Cargando texto="Calculando carreras…" />
        ) : consolidado.length === 0 ? (
          <Vacio>No hay carreras asignadas en este rango.</Vacio>
        ) : (
          <>
            {/* El total a pagar siempre va en dólares —así está tarifada cada
                zona—, pero partido según con qué plata entró la carrera, que es
                lo que decide de qué caja sale el pago. */}
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Dato etiqueta="Carreras" valor={totalCarreras} />
              <Dato etiqueta="Total a pagar" valor={formatearUSD(totalPagar)} tono="malo" />
              <Dato
                etiqueta="De carreras cobradas en $"
                valor={formatearUSD(totalPorMoneda.USD)}
                detalle={`${totalMonedas.USD} carrera${totalMonedas.USD === 1 ? '' : 's'}`}
              />
              <Dato
                etiqueta="De carreras cobradas en Bs"
                valor={formatearUSD(totalPorMoneda.BS)}
                detalle={`${totalMonedas.BS} carrera${totalMonedas.BS === 1 ? '' : 's'}`}
              />
              {mixtas > 0 && (
                <Dato
                  etiqueta="De carreras mixtas"
                  valor={formatearUSD(pagarMixtas)}
                  detalle={
                    mixtas === 1 ? '1 carrera pagada de dos formas' : `${mixtas} carreras pagadas de dos formas`
                  }
                />
              )}
              {facturadas > 0 && (
                <Dato
                  etiqueta="De comandas facturadas aparte"
                  valor={formatearUSD(pagarFacturadas)}
                  // Cobraron por la otra caja, pero con una moneda concreta: es
                  // lo que dice de dónde sacar la plata para esas carreras.
                  detalle={detalleFacturadas}
                />
              )}
              {conMargen && (
                <Dato
                  etiqueta="Margen del delivery"
                  valor={formatearUSD(totalCobrado - totalPagar)}
                  tono="bueno"
                  detalle={`Cobrado ${formatearUSD(totalCobrado)}`}
                />
              )}
            </div>

            <ContenedorTabla>
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Repartidor</th>
                    <th className="py-2 pr-3 text-right">Carreras</th>
                    <th className="py-2 pr-3 text-right">Cobradas en $</th>
                    <th className="py-2 pr-3 text-right">Cobradas en Bs</th>
                    {mixtas > 0 && <th className="py-2 pr-3 text-right">Mixtas</th>}
                    {facturadas > 0 && <th className="py-2 pr-3 text-right">Facturadas aparte</th>}
                    <th className="py-2 pr-3 text-right">A pagar</th>
                    {conMargen && (
                      <>
                        <th className="py-2 pr-3 text-right">Cobrado al cliente</th>
                        <th className="py-2 text-right">Margen</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {consolidado.map((fila) => {
                    const suyo = desglosePorRepartidor.get(fila.repartidor_id)
                    const suyasMixtas = (suyo?.carreras.MIXTO ?? 0) + (suyo?.carreras.SIN_PAGO ?? 0)
                    return (
                    <tr key={fila.repartidor_id} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3 font-semibold">{fila.repartidor}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{fila.carreras}</td>
                      <CeldaMoneda carreras={suyo?.carreras.USD ?? 0} pagar={suyo?.pagar.USD ?? 0} />
                      <CeldaMoneda carreras={suyo?.carreras.BS ?? 0} pagar={suyo?.pagar.BS ?? 0} />
                      {mixtas > 0 && (
                        <CeldaMoneda
                          carreras={suyasMixtas}
                          pagar={(suyo?.pagar.MIXTO ?? 0) + (suyo?.pagar.SIN_PAGO ?? 0)}
                        />
                      )}
                      {facturadas > 0 && (
                        <CeldaMoneda
                          carreras={suyo?.carreras.FACTURADA ?? 0}
                          pagar={suyo?.pagar.FACTURADA ?? 0}
                        />
                      )}
                      <td className="py-2.5 pr-3 text-right text-lg font-bold tabular-nums text-slate-900">
                        {formatearUSD(fila.total_pagar_usd)}
                      </td>
                      {conMargen && (
                        <>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-slate-500">
                            {formatearUSD(fila.total_cobrado_usd)}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-slate-500">
                            {formatearUSD(fila.margen_usd)}
                          </td>
                        </>
                      )}
                    </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-bold">
                    <td className="py-2.5 pr-3">Total</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{totalCarreras}</td>
                    <CeldaMoneda carreras={totalMonedas.USD} pagar={totalPorMoneda.USD} />
                    <CeldaMoneda carreras={totalMonedas.BS} pagar={totalPorMoneda.BS} />
                    {mixtas > 0 && <CeldaMoneda carreras={mixtas} pagar={pagarMixtas} />}
                    {facturadas > 0 && <CeldaMoneda carreras={facturadas} pagar={pagarFacturadas} />}
                    <td className="py-2.5 pr-3 text-right text-lg tabular-nums">{formatearUSD(totalPagar)}</td>
                    {conMargen && (
                      <>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{formatearUSD(totalCobrado)}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatearUSD(totalCobrado - totalPagar)}</td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </ContenedorTabla>
          </>
        )}
      </Tarjeta>

      {sinAsignar.length > 0 && (
        <Alerta tono="aviso" titulo={`${sinAsignar.length} carrera(s) sin repartidor`}>
          Estas órdenes no se le están pagando a nadie: facturas{' '}
          {sinAsignar.map((o) => o.numero_factura).join(', ')}. Asígnalas desde Órdenes del día.
        </Alerta>
      )}

      {/* Con varios días, el desglose diario es lo que el repartidor va a
          querer ver si reclama que le falta una carrera. */}
      {!unSoloDia && porDia.length > 0 && (
        <Tarjeta titulo="Desglose por día">
          <ContenedorTabla>
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Repartidor</th>
                  <th className="py-2 pr-3 text-right">Carreras</th>
                  <th className="py-2 text-right">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((fila) => (
                  <tr key={`${fila.fecha_operativa}-${fila.repartidor_id}`} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{formatearFecha(fila.fecha_operativa)}</td>
                    <td className="py-2 pr-3">{fila.repartidor}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fila.carreras}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatearUSD(fila.total_pagar_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
        </Tarjeta>
      )}
    </div>
  )
}

export default Liquidacion
