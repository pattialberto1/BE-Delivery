import { useEffect, useState } from 'react'
import { ETIQUETA_METODO, type Banco, type BorradorPago, type MetodoPago } from '../lib/tipos'
import { monedaDeMetodo, requiereBanco, requiereCaptura, requiereReferencia } from '../lib/reglas'
import { Boton, Campo, Entrada, Insignia, Seleccion } from './UI'

const METODOS: MetodoPago[] = [
  'pago_movil',
  'transferencia',
  'efectivo_bs',
  'efectivo_usd',
  'zelle',
  'binance',
  'punto_venta',
]

interface Props {
  pago: BorradorPago
  indice: number
  bancos: Banco[]
  errores: Record<string, string>
  /** Referencia ya usada en otra orden — la alerta clave contra la captura repetida. */
  duplicado?: string | null
  onCambiar: (cambios: Partial<BorradorPago>) => void
  onEliminar: () => void
}

export function FilaPago({ pago, indice, bancos, errores, duplicado, onCambiar, onEliminar }: Props) {
  const [previsualizacion, setPrevisualizacion] = useState<string | null>(null)

  // La miniatura de la captura sale de un blob local; hay que liberarlo al
  // cambiar de archivo o la pestaña acumula memoria durante todo el turno.
  useEffect(() => {
    if (!pago.archivo) {
      setPrevisualizacion(null)
      return
    }
    const url = URL.createObjectURL(pago.archivo)
    setPrevisualizacion(url)
    return () => URL.revokeObjectURL(url)
  }, [pago.archivo])

  const conBanco = requiereBanco(pago.metodo)
  const conReferencia = requiereReferencia(pago.metodo)
  const conCaptura = requiereCaptura(pago.metodo)
  const err = (campo: string) => errores[`pago.${pago.clave}.${campo}`]

  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-bold text-slate-700">Pago {indice + 1}</span>
        <Boton variante="peligro" onClick={onEliminar} className="min-h-9 px-3 text-sm">
          Quitar
        </Boton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Forma de pago" requerido>
          <Seleccion
            value={pago.metodo}
            onChange={(e) => {
              const metodo = e.target.value as MetodoPago
              // La moneda la manda el método: Zelle siempre entra en dólares,
              // pago móvil siempre en bolívares. Un descuido aquí desarma el cuadre.
              onCambiar({
                metodo,
                moneda: monedaDeMetodo(metodo),
                banco_id: requiereBanco(metodo) ? pago.banco_id : null,
                referencia: requiereReferencia(metodo) ? pago.referencia : '',
              })
            }}
          >
            {METODOS.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_METODO[m]}
              </option>
            ))}
          </Seleccion>
        </Campo>

        {conBanco && (
          <Campo etiqueta="Banco emisor" requerido error={err('banco_id')}>
            <Seleccion value={pago.banco_id ?? ''} onChange={(e) => onCambiar({ banco_id: e.target.value || null })}>
              <option value="">— Elegir —</option>
              {bancos
                .filter((b) => b.activo)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.codigo ? `${b.codigo} · ` : ''}
                    {b.nombre}
                  </option>
                ))}
            </Seleccion>
          </Campo>
        )}

        {conReferencia && (
          <Campo etiqueta="Referencia" requerido error={err('referencia')}>
            <Entrada
              value={pago.referencia}
              onChange={(e) => onCambiar({ referencia: e.target.value })}
              inputMode="numeric"
              placeholder="Número de la captura"
            />
          </Campo>
        )}

        <Campo etiqueta={`Monto (${pago.moneda === 'USD' ? '$' : 'Bs'})`} requerido error={err('monto')}>
          <Entrada
            value={pago.monto}
            onChange={(e) => onCambiar({ monto: e.target.value })}
            inputMode="decimal"
            placeholder="0,00"
          />
        </Campo>

        {conReferencia && (
          <Campo etiqueta="Emisor" ayuda="Teléfono o cédula de la captura">
            <Entrada
              value={pago.emisor}
              onChange={(e) => onCambiar({ emisor: e.target.value })}
              inputMode="numeric"
              placeholder="Opcional"
            />
          </Campo>
        )}

        {conCaptura && (
          <Campo etiqueta="Captura del pago" error={err('archivo')} className="sm:col-span-2">
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onCambiar({ archivo: e.target.files?.[0] })}
                className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm
                  file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-2
                  file:text-sm file:font-semibold file:text-slate-700"
              />
              {previsualizacion && (
                <a href={previsualizacion} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={previsualizacion}
                    alt="Captura del pago"
                    className="h-12 w-12 rounded-md border border-slate-300 object-cover"
                  />
                </a>
              )}
            </div>
          </Campo>
        )}
      </div>

      {duplicado && (
        <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
          ⚠ Esta referencia ya está cargada en la factura {duplicado}. Revisa si el cliente mandó la misma captura dos
          veces.
        </p>
      )}

      {!conReferencia && (
        <p className="mt-2">
          <Insignia>Sin referencia que verificar</Insignia>
        </p>
      )}
    </div>
  )
}
