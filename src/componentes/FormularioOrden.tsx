import type { Banco, BorradorPago, Cuenta, Repartidor, TipoOrden, Zona } from '../lib/tipos'
import { ETIQUETA_MONEDA_FACTURADA, ETIQUETA_TIPO, METODOS_PICKUP } from '../lib/tipos'
import type { MonedaFacturada } from '../lib/tipos'
import { aNumero, formatearBS, formatearUSD, metodoParaCompletar, monedaDeMetodo } from '../lib/reglas'
import { Alerta, Boton, Campo, Entrada, Seleccion, Tarjeta, AreaTexto } from './UI'
import { FilaPago, type Choque } from './FilaPago'
import { SelectorZona } from './SelectorZona'
import { pagoVacio, type DatosFormulario } from '../lib/borradores'

interface Props {
  form: DatosFormulario
  setForm: (form: DatosFormulario) => void
  pagos: BorradorPago[]
  setPagos: (actualizar: (previos: BorradorPago[]) => BorradorPago[]) => void
  /** Cuánto falta por cubrir, en dólares. Cero si ya cuadra. */
  faltaPorCobrar: number
  tasa: number
  zonasActivas: Zona[]
  repartidores: Repartidor[]
  cuentas: Cuenta[]
  bancos: Banco[]
  choques: Record<string, Choque | null>
  errores: Record<string, string>
  facturaDuplicada: boolean
  refFactura?: React.Ref<HTMLInputElement>
}

/**
 * El formulario de una orden.
 *
 * Lo comparten la pantalla de carga y la de edición: si las reglas de un campo
 * cambian —qué se pide para un pick up, cómo se propone el pago que falta— tienen
 * que cambiar en las dos a la vez, y con dos copias eso no se sostiene.
 */
export function FormularioOrden({
  form,
  setForm,
  pagos,
  setPagos,
  faltaPorCobrar,
  tasa,
  zonasActivas,
  repartidores,
  cuentas,
  bancos,
  choques,
  errores: erroresPorCampo,
  facturaDuplicada,
  refFactura,
}: Props) {
  // Lo que suma el desglose de una mixta, para poder cotejarlo con el total de
  // la comanda mientras se teclea.
  const desgloseMixto =
    (Number.isFinite(aNumero(form.facturada_divisa_usd)) ? aNumero(form.facturada_divisa_usd) : 0) +
    (tasa > 0 && Number.isFinite(aNumero(form.facturada_bs)) ? aNumero(form.facturada_bs) / tasa : 0)

  /** Agrega un pago por lo que falta, con el monto y la forma ya propuestos. */
  function agregarPagoDelResto() {
    const metodo = metodoParaCompletar(pagos)
    const moneda = monedaDeMetodo(metodo)
    const monto = moneda === 'USD' ? faltaPorCobrar : faltaPorCobrar * tasa
    setPagos((previos) => [
      ...previos,
      {
        ...pagoVacio(),
        metodo,
        moneda,
        // Dos decimales: es un monto de dinero, no el resultado de una división.
        monto: monto.toFixed(2).replace('.', ','),
      },
    ])
  }

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Datos del pedido">
        {/* El tipo va primero porque cambia el resto del formulario. */}
        <div className="mb-4 flex gap-2">
          {(['delivery', 'pickup'] as TipoOrden[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                // Un pick up se cobra en el local por definición: la marca de
                // facturada aparte no tiene sentido ahí y la base la rechaza.
                setForm({ ...form, tipo: t, facturada_aparte: t === 'pickup' ? false : form.facturada_aparte })
                // Si había un pago con una forma que el pick up no admite,
                // se reencauza en vez de quedar en un estado imposible.
                if (t === 'pickup') {
                  setPagos((previos) =>
                    previos.map((pago) =>
                      METODOS_PICKUP.includes(pago.metodo)
                        ? pago
                        : { ...pago, metodo: 'efectivo_usd', moneda: monedaDeMetodo('efectivo_usd'), cuenta_id: null, banco_id: null, referencia: '' },
                    ),
                  )
                }
              }}
              className={`min-h-12 flex-1 rounded-lg border-2 px-4 font-bold transition-colors ${
                form.tipo === t
                  ? 'border-marca-600 bg-marca-50 text-marca-800'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {ETIQUETA_TIPO[t]}
            </button>
          ))}
        </div>

        {/*
          La comanda que el cliente pide con factura fiscal se cobra por la caja
          del local, no por la del delivery. Hay que cargarla igual —el
          repartidor la lleva y hay que pagarle—, pero su plata no entra acá.
        */}
        {form.tipo === 'delivery' && (
          <label
            className={`mb-4 flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-colors ${
              form.facturada_aparte ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0"
              checked={form.facturada_aparte}
              onChange={(e) => {
                setForm({
                  ...form,
                  facturada_aparte: e.target.checked,
                  // Al desmarcar, la moneda deja de tener sentido: la orden pasa
                  // a decir en qué entró por sus propios pagos.
                  moneda_facturada: e.target.checked ? form.moneda_facturada : '',
                })
                // El cobro pasó por la otra caja: acá no se carga ningún pago.
                if (e.target.checked) setPagos(() => [])
              }}
            />
            <span>
              <span className="font-semibold text-slate-800">Se facturó aparte por caja</span>
              <span className="block text-sm text-slate-600">
                {form.facturada_aparte
                  ? 'No se cargan pagos acá y no suma en la caja del delivery. Solo se le paga la carrera al repartidor.'
                  : 'Márcalo si el cliente pidió factura fiscal y se cobró por la caja del local.'}
              </span>
            </span>
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="N° de factura"
            requerido
            error={
              facturaDuplicada
                ? 'Ese número ya está cargado hoy.'
                : erroresPorCampo.numero_factura
            }
            ayuda={
              form.facturada_aparte
                ? 'El de la factura fiscal que salió por caja'
                : 'El que emite la tablet de comandas'
            }
          >
            <Entrada
              ref={refFactura}
              value={form.numero_factura}
              onChange={(e) => setForm({ ...form, numero_factura: e.target.value })}
              inputMode="numeric"
              autoFocus
            />
          </Campo>

          <Campo
            etiqueta="Nombre del cliente"
            requerido
            error={erroresPorCampo.cliente_nombre}
            ayuda="Como aparece en WhatsApp"
          >
            <Entrada
              value={form.cliente_nombre}
              onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })}
              placeholder="Ej: María Rodríguez"
            />
          </Campo>

          <Campo etiqueta="Teléfono">
            <Entrada
              value={form.cliente_telefono}
              onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })}
              inputMode="tel"
              placeholder="Opcional"
            />
          </Campo>

          <Campo etiqueta="Monto del pedido ($)" requerido error={erroresPorCampo.monto_pedido_usd}
            ayuda="Sin el delivery">
            <Entrada
              value={form.monto_pedido_usd}
              onChange={(e) => setForm({ ...form, monto_pedido_usd: e.target.value })}
              inputMode="decimal"
              placeholder="0,00"
            />
          </Campo>

          {form.tipo === 'delivery' && (
          <Campo
            etiqueta="Dirección o referencia"
            ayuda="Opcional. Si mandó el location, puedes pegar aquí el enlace"
            className="sm:col-span-2"
          >
            <Entrada
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              placeholder="Opcional"
            />
          </Campo>
          )}

          {form.tipo === 'delivery' && (
          <Campo
            etiqueta="Zona"
            requerido
            error={erroresPorCampo.zona_id}
            ayuda="Escribe parte del nombre; la tarifa sale sola"
          >
            <SelectorZona
              zonas={zonasActivas}
              valor={form.zona_id}
              onCambiar={(zonaId) => setForm({ ...form, zona_id: zonaId })}
              error={erroresPorCampo.zona_id}
            />
          </Campo>
          )}

          {form.tipo === 'delivery' && (
            <Campo etiqueta="Repartidor" ayuda="Se puede asignar después, cuando se sepa quién la lleva">
              <Seleccion
                value={form.repartidor_id}
                onChange={(e) => setForm({ ...form, repartidor_id: e.target.value })}
              >
                <option value="">— Todavía no se sabe —</option>
                {repartidores
                  .filter((r) => r.activo)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
              </Seleccion>
            </Campo>
          )}

          <Campo etiqueta="Notas" className="sm:col-span-2">
            <AreaTexto
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: (e.target as HTMLTextAreaElement).value })}
              placeholder="Opcional"
            />
          </Campo>
        </div>
      </Tarjeta>

      {form.facturada_aparte ? (
        <Tarjeta titulo="Pagos">
          <Alerta tono="info" titulo="Esta comanda se cobra por la caja del local">
            <p>
              El cliente paga allá y le sale su factura fiscal, así que acá no se carga ningún pago ni captura.
            </p>
            <p className="mt-1">
              En el cierre aparece en su propio apartado y <strong>no suma</strong> en ningún total de la caja del
              delivery. Lo único que cuenta es la carrera del repartidor, que sí se le paga.
            </p>
          </Alerta>

          {/*
            Aunque la plata no entre acá, sí hay que saber con qué moneda entró:
            es lo que decide de cuál caja sale la carrera del repartidor.
          */}
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              ¿Con qué pagó el cliente? <span className="text-marca-700">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {(['BS', 'USD', 'MIXTO'] as MonedaFacturada[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      moneda_facturada: m,
                      // Al salir de «parte y parte» el desglose deja de aplicar.
                      facturada_bs: m === 'MIXTO' ? form.facturada_bs : '',
                      facturada_divisa_usd: m === 'MIXTO' ? form.facturada_divisa_usd : '',
                    })
                  }
                  className={`min-h-12 flex-1 rounded-lg border-2 px-4 font-bold transition-colors ${
                    form.moneda_facturada === m
                      ? 'border-marca-600 bg-marca-50 text-marca-800'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {ETIQUETA_MONEDA_FACTURADA[m]}
                </button>
              ))}
            </div>
            {erroresPorCampo.moneda_facturada && (
              <p className="mt-1.5 text-sm font-semibold text-red-700">{erroresPorCampo.moneda_facturada}</p>
            )}
          </div>

          {/*
            «Parte y parte» a secas no dice cuánto sacar de cada caja para
            pagarle la carrera al repartidor, así que se piden los dos montos.
          */}
          {form.moneda_facturada === 'MIXTO' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Pagó en bolívares (Bs)" requerido error={erroresPorCampo.facturada_bs}>
                <Entrada
                  value={form.facturada_bs}
                  onChange={(e) => setForm({ ...form, facturada_bs: e.target.value })}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </Campo>
              <Campo etiqueta="Pagó en dólares ($)" requerido error={erroresPorCampo.facturada_divisa_usd}>
                <Entrada
                  value={form.facturada_divisa_usd}
                  onChange={(e) => setForm({ ...form, facturada_divisa_usd: e.target.value })}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </Campo>
              {desgloseMixto > 0 && (
                <p className="text-sm text-slate-600 sm:col-span-2">
                  El desglose suma <strong>{formatearUSD(desgloseMixto)}</strong>
                  {tasa > 0 && ` (${formatearBS(desgloseMixto * tasa)})`}.
                </p>
              )}
            </div>
          )}
        </Tarjeta>
      ) : (
      <Tarjeta
        titulo="Pagos"
        acciones={
          <Boton variante="secundario" onClick={() => setPagos((previos) => [...previos, pagoVacio()])} className="min-h-10 text-sm">
            + Otro pago
          </Boton>
        }
      >
        <div className="space-y-3">
          {pagos.map((pago, i) => (
            <FilaPago
              key={pago.clave}
              pago={pago}
              indice={i}
              metodos={form.tipo === 'pickup' ? METODOS_PICKUP : undefined}
              cuentas={cuentas}
              bancos={bancos}
              errores={erroresPorCampo}
              choque={choques[pago.clave]}
              onCambiar={(cambios) =>
                setPagos((previos) => previos.map((p) => (p.clave === pago.clave ? { ...p, ...cambios } : p)))
              }
              onEliminar={() => setPagos((previos) => previos.filter((p) => p.clave !== pago.clave))}
            />
          ))}
          {pagos.length === 0 && (
            <Alerta tono="error">Agrega al menos un pago antes de guardar.</Alerta>
          )}

          {/* Que un cliente pague una parte por pago móvil y el resto en
              dólares es de todos los días, pero "+ Otro pago" arriba no lo
              sugiere. Cuando falta plata se ofrece aquí, con el monto ya
              puesto: es el momento exacto en que hace falta. */}
          {faltaPorCobrar > 0.01 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
              <p className="font-semibold text-amber-900">
                Faltan {formatearUSD(faltaPorCobrar)} ({formatearBS(faltaPorCobrar * tasa)}) por cubrir.
              </p>
              <p className="mt-0.5 text-sm text-amber-800">
                ¿Pagó el resto de otra forma? Agrégalo y el cuadre cierra solo.
              </p>
              <Boton className="mt-2" onClick={agregarPagoDelResto}>
                + Agregar los {formatearUSD(faltaPorCobrar)} que faltan
              </Boton>
            </div>
          )}
        </div>
      </Tarjeta>
      )}
    </div>
  )
}
