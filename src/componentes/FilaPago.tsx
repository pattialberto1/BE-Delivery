import { useEffect, useState } from 'react'
import { ETIQUETA_METODO, type Banco, type BorradorPago, type Cuenta, type MetodoPago } from '../lib/tipos'
import {
  admiteBancoEmisor,
  formatearMonto,
  monedaDeMetodo,
  referenciaEsConfiable,
  requiereCaptura,
  requiereCuenta,
  requiereReferencia,
} from '../lib/reglas'
import { Boton, Campo, Entrada, Insignia, Seleccion } from './UI'

const TODOS_LOS_METODOS: MetodoPago[] = [
  'pago_movil',
  'transferencia',
  'efectivo_bs',
  'efectivo_usd',
  'zelle',
  'binance',
  'punto_venta',
]

/** Un pago ya cargado antes que choca con el que se está tecleando. */
export interface Choque {
  factura: string
  monto: number
  moneda: 'BS' | 'USD'
  fecha: string
  fuerza: 'seguro' | 'posible'
}

interface Props {
  pago: BorradorPago
  indice: number
  /** Formas de pago admitidas. Un pick up solo acepta dos. */
  metodos?: MetodoPago[]
  cuentas: Cuenta[]
  bancos: Banco[]
  errores: Record<string, string>
  choque?: Choque | null
  onCambiar: (cambios: Partial<BorradorPago>) => void
  onEliminar: () => void
}

export function FilaPago({
  pago,
  indice,
  metodos = TODOS_LOS_METODOS,
  cuentas,
  bancos,
  errores,
  choque,
  onCambiar,
  onEliminar,
}: Props) {
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

  const conCuenta = requiereCuenta(pago.metodo)
  const conBancoEmisor = admiteBancoEmisor(pago.metodo)
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
                cuenta_id: requiereCuenta(metodo) ? pago.cuenta_id : null,
                banco_id: admiteBancoEmisor(metodo) ? pago.banco_id : null,
                referencia: requiereReferencia(metodo) ? pago.referencia : '',
              })
            }}
          >
            {metodos.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_METODO[m]}
              </option>
            ))}
          </Seleccion>
        </Campo>

        {conCuenta && (
          <Campo
            etiqueta="Entró en"
            requerido
            error={err('cuenta_id')}
            ayuda="Nuestra cuenta que recibió"
          >
            <Seleccion value={pago.cuenta_id ?? ''} onChange={(e) => onCambiar({ cuenta_id: e.target.value || null })}>
              <option value="">— Elegir —</option>
              {cuentas
                .filter((c) => c.activo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.abreviatura} · {c.nombre}
                  </option>
                ))}
            </Seleccion>
          </Campo>
        )}

        {conReferencia && (
          <Campo
            etiqueta="Referencia"
            requerido
            error={err('referencia')}
            // Se acepta el recorte de siempre, pero la completa hace que el
            // aviso de captura repetida pase de sospecha a certeza.
            ayuda={
              referenciaEsConfiable(pago.referencia)
                ? 'Completa: los repetidos se detectan solos'
                : 'Completa si se puede; si no, los últimos 4 dígitos'
            }
          >
            <Entrada
              value={pago.referencia}
              onChange={(e) => onCambiar({ referencia: e.target.value })}
              inputMode="numeric"
              placeholder="Completa o últimos 4"
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

        {conBancoEmisor && (
          <Campo etiqueta="Banco del cliente" ayuda="Opcional">
            <Seleccion value={pago.banco_id ?? ''} onChange={(e) => onCambiar({ banco_id: e.target.value || null })}>
              <option value="">— Sin especificar —</option>
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
          <Campo etiqueta="Emisor" ayuda="Teléfono o cédula, opcional">
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

      {/* El aviso muestra el monto del pago que choca: si es el mismo, casi
          seguro es la captura reenviada; si no, con referencias de 4 dígitos
          la coincidencia puede ser casual y la decide la cajera. */}
      {choque && (
        <p
          className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold ${
            choque.fuerza === 'seguro'
              ? 'border-red-300 bg-red-50 text-red-900'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          {choque.fuerza === 'seguro' ? '⚠ Ya cargado: ' : 'Ojo: '}
          esta referencia está en la factura {choque.factura} por{' '}
          {formatearMonto(choque.monto, choque.moneda)}
          {choque.fuerza === 'seguro'
            ? '. Revisa si el cliente mandó la misma captura dos veces.'
            : ', con un monto distinto al de aquí. Anotando solo los últimos 4 dígitos esto puede ser casualidad — confirma antes de seguir, o teclea la referencia completa para salir de dudas.'}
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
