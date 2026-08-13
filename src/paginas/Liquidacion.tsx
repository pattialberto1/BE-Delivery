import { useMemo, useState } from 'react'
import { useSesion } from '../contexto/Sesion'
import { useOrdenesRango } from '../hooks/useOrdenes'
import { formatearFecha, formatearUSD } from '../lib/reglas'
import {
  consolidarLiquidacion,
  exportarLiquidacion,
  hayMargenDeDelivery,
  liquidacionDesdeOrdenes,
} from '../lib/exportar'
import { Alerta, Boton, Cargando, ContenedorTabla, Dato, Entrada, Tarjeta, Vacio } from '../componentes/UI'

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
  const sinAsignar = useMemo(() => ordenes.filter((o) => !o.repartidor_id), [ordenes])

  const totalPagar = consolidado.reduce((s, f) => s + f.total_pagar_usd, 0)
  const totalCobrado = consolidado.reduce((s, f) => s + f.total_cobrado_usd, 0)
  const totalCarreras = consolidado.reduce((s, f) => s + f.carreras, 0)

  // Con el esquema actual el repartidor cobra el delivery completo, así que
  // «cobrado» y «a pagar» son la misma cifra. Se muestran solo si difieren.
  const conMargen = useMemo(() => hayMargenDeDelivery(consolidado), [consolidado])

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
            <div className={`mb-4 grid gap-3 ${conMargen ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              <Dato etiqueta="Carreras" valor={totalCarreras} />
              <Dato etiqueta="Total a pagar" valor={formatearUSD(totalPagar)} tono="malo" />
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
              <table className="w-full min-w-[38rem] text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Repartidor</th>
                    <th className="py-2 pr-3 text-right">Carreras</th>
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
                  {consolidado.map((fila) => (
                    <tr key={fila.repartidor_id} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3 font-semibold">{fila.repartidor}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{fila.carreras}</td>
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
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-bold">
                    <td className="py-2.5 pr-3">Total</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{totalCarreras}</td>
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
