import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSesion } from '../contexto/Sesion'
import { mensajeDeError, subirCaptura, supabase } from '../lib/supabase'
import {
  aNumero,
  calcularResumen,
  formatearBS,
  formatearFecha,
  formatearUSD,
  tieneErrores,
  validarOrden,
  type DatosOrdenAValidar,
} from '../lib/reglas'
import type { BorradorPago, Orden, Pago } from '../lib/tipos'
import { Alerta, Boton, Cargando, Dato, Tarjeta } from '../componentes/UI'
import { FormularioOrden } from '../componentes/FormularioOrden'
import { formularioVacio, type DatosFormulario } from '../lib/borradores'

/**
 * Editar una orden ya cargada.
 *
 * Usa el mismo formulario que la pantalla de carga, así que las reglas son
 * idénticas: la tarifa sigue saliendo de la zona, el cuadre se recalcula solo y
 * un pick up sigue sin pedir repartidor.
 *
 * Los pagos se reemplazan enteros al guardar en vez de calcular qué cambió:
 * son dos o tres filas por orden, y una operación simple que siempre deja el
 * resultado correcto vale más que un diff que puede equivocarse con la plata.
 */
export function EditarOrden() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { zonas, repartidores, bancos, cuentas, esAdmin } = useSesion()

  const [orden, setOrden] = useState<Orden | null>(null)
  const [form, setForm] = useState<DatosFormulario>(formularioVacio)
  const [pagos, setPagos] = useState<BorradorPago[]>([])
  const [pagosOriginales, setPagosOriginales] = useState<Pago[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tocado, setTocado] = useState(false)

  const zonasActivas = useMemo(() => zonas.filter((z) => z.activo), [zonas])
  const zonaElegida = useMemo(() => zonas.find((z) => z.id === form.zona_id), [zonas, form.zona_id])

  const cargar = useCallback(async () => {
    if (!id) return
    setCargando(true)
    setError(null)

    const [resOrden, resPagos] = await Promise.all([
      supabase.from('ordenes').select('*').eq('id', id).maybeSingle(),
      supabase.from('pagos').select('*').eq('orden_id', id).order('creado_en'),
    ])

    if (resOrden.error || !resOrden.data) {
      setError('No se encontró esa orden.')
      setCargando(false)
      return
    }

    const o = resOrden.data as Orden
    setOrden(o)
    setForm({
      tipo: o.tipo,
      facturada_aparte: o.facturada_aparte,
      moneda_facturada: o.moneda_facturada ?? '',
      facturada_bs: o.facturada_bs == null ? '' : String(o.facturada_bs),
      facturada_divisa_usd: o.facturada_divisa_usd == null ? '' : String(o.facturada_divisa_usd),
      numero_factura: o.numero_factura,
      cliente_nombre: o.cliente_nombre,
      cliente_telefono: o.cliente_telefono ?? '',
      direccion: o.direccion ?? '',
      zona_id: o.zona_id ?? '',
      repartidor_id: o.repartidor_id ?? '',
      monto_pedido_usd: String(o.monto_pedido_usd),
      notas: o.notas ?? '',
    })

    const guardados = (resPagos.data ?? []) as Pago[]
    setPagosOriginales(guardados)
    setPagos(
      guardados.map((p) => ({
        clave: p.id,
        metodo: p.metodo,
        cuenta_id: p.cuenta_id,
        banco_id: p.banco_id,
        referencia: p.referencia ?? '',
        emisor: p.emisor ?? '',
        monto: String(p.monto),
        moneda: p.moneda,
        // La captura ya subida se conserva salvo que se adjunte otra.
        imagen_path: p.imagen_path,
      })),
    )
    setCargando(false)
  }, [id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const datosAValidar: DatosOrdenAValidar = useMemo(
    () => ({
      tipo: form.tipo,
      facturada_aparte: form.facturada_aparte,
      moneda_facturada: form.moneda_facturada,
      facturada_bs: form.facturada_bs,
      facturada_divisa_usd: form.facturada_divisa_usd,
      numero_factura: form.numero_factura,
      cliente_nombre: form.cliente_nombre,
      direccion: form.direccion,
      zona_id: form.zona_id,
      repartidor_id: form.repartidor_id || null,
      monto_pedido_usd: form.monto_pedido_usd,
      tarifa_cliente_usd: form.tipo === 'pickup' ? 0 : (zonaElegida?.tarifa_cliente_usd ?? 0),
      tasa_bs_por_usd: Number(orden?.tasa_bs_por_usd ?? 0),
      pagos,
    }),
    [form, zonaElegida, orden, pagos],
  )

  const problemas = useMemo(() => validarOrden(datosAValidar), [datosAValidar])
  const resumen = useMemo(() => calcularResumen(datosAValidar), [datosAValidar])
  const erroresPorCampo = useMemo(() => {
    const mapa: Record<string, string> = {}
    for (const p of problemas) {
      if (p.nivel === 'error' && !mapa[p.campo]) mapa[p.campo] = p.mensaje
    }
    return mapa
  }, [problemas])

  const faltaPorCobrar =
    pagos.length > 0 && resumen.total > 0 && resumen.diferencia < 0 ? -resumen.diferencia : 0
  const avisos = problemas.filter((p) => p.nivel === 'aviso')
  const errores = problemas.filter((p) => p.nivel === 'error')

  async function guardar() {
    setTocado(true)
    setError(null)
    if (!orden || tieneErrores(problemas)) return
    if (form.tipo === 'delivery' && !zonaElegida) return

    setGuardando(true)
    const esPickup = form.tipo === 'pickup'
    const mixtaFacturada = form.facturada_aparte && form.moneda_facturada === 'MIXTO'

    try {
      // Las capturas nuevas primero, para no dejar la orden apuntando a nada.
      const rutas = await Promise.all(
        pagos.map(async (pago) =>
          pago.archivo ? subirCaptura(pago.archivo, orden.fecha_operativa) : (pago.imagen_path ?? null),
        ),
      )

      const { error: errorOrden } = await supabase
        .from('ordenes')
        .update({
          tipo: form.tipo,
          facturada_aparte: form.facturada_aparte,
          moneda_facturada: form.facturada_aparte ? form.moneda_facturada || null : null,
          // El desglose solo tiene sentido en una mixta; en las demás la moneda
          // ya lo dice todo y guardarlo sería un dato que puede contradecirla.
          facturada_bs: mixtaFacturada ? aNumero(form.facturada_bs) : null,
          facturada_divisa_usd: mixtaFacturada ? aNumero(form.facturada_divisa_usd) : null,
          numero_factura: form.numero_factura.trim(),
          cliente_nombre: form.cliente_nombre.trim(),
          cliente_telefono: form.cliente_telefono.trim() || null,
          direccion: form.direccion.trim() || null,
          zona_id: esPickup ? null : zonaElegida!.id,
          tarifa_cliente_usd: esPickup ? 0 : zonaElegida!.tarifa_cliente_usd,
          pago_repartidor_usd: esPickup ? 0 : zonaElegida!.pago_repartidor_usd,
          repartidor_id: esPickup ? null : form.repartidor_id || null,
          monto_pedido_usd: aNumero(form.monto_pedido_usd),
          notas: form.notas.trim() || null,
        })
        .eq('id', orden.id)

      if (errorOrden) throw errorOrden

      // Los pagos se reemplazan enteros. Se borran primero para que una
      // referencia que se movió de un pago a otro no choque consigo misma.
      if (pagosOriginales.length > 0) {
        const { error: errorBorrado } = await supabase.from('pagos').delete().eq('orden_id', orden.id)
        if (errorBorrado) throw errorBorrado
      }

      // Sin pagos no hay nada que insertar: es el caso de la comanda facturada
      // aparte, que se cobró por la caja del local.
      const { error: errorPagos } = pagos.length === 0 ? { error: null } : await supabase.from('pagos').insert(
        pagos.map((pago, i) => ({
          orden_id: orden.id,
          metodo: pago.metodo,
          cuenta_id: pago.cuenta_id,
          banco_id: pago.banco_id,
          referencia: pago.referencia.trim() || null,
          emisor: pago.emisor.trim() || null,
          monto: aNumero(pago.monto),
          moneda: pago.moneda,
          imagen_path: rutas[i],
        })),
      )
      if (errorPagos) throw errorPagos

      navegar('/ordenes')
    } catch (e) {
      setError(mensajeDeError(e))
      // Si el guardado de los pagos falló después de borrarlos, la orden queda
      // sin comprobantes: se recargan de la base para no perder la pantalla.
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <Cargando texto="Cargando la orden…" />

  if (!orden) {
    return (
      <div className="space-y-4">
        <Alerta tono="error">{error ?? 'No se encontró esa orden.'}</Alerta>
        <Boton variante="secundario" onClick={() => navegar('/ordenes')}>
          Volver
        </Boton>
      </div>
    )
  }

  // Una orden ya verificada solo la toca la administradora: si la cajera
  // pudiera cambiarla después de aprobada, la verificación no valdría nada.
  const soloLectura = orden.estado === 'verificada' && !esAdmin

  return (
    <div className="space-y-4">
      {error && <Alerta tono="error" titulo="No se pudo guardar">{error}</Alerta>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Editando la factura {orden.numero_factura}</h1>
          <p className="text-sm text-slate-500">
            Jornada del {formatearFecha(orden.fecha_operativa)} · tasa {orden.tasa_bs_por_usd} Bs/$
          </p>
        </div>
        <Boton variante="secundario" onClick={() => navegar('/ordenes')}>
          Cancelar
        </Boton>
      </div>

      {soloLectura && (
        <Alerta tono="aviso" titulo="Esta orden ya está verificada">
          Solo la administradora puede modificarla. Pídeselo a ella.
        </Alerta>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className={`space-y-4 ${soloLectura ? 'pointer-events-none opacity-60' : ''}`}>
          <FormularioOrden
            form={form}
            setForm={setForm}
            pagos={pagos}
            setPagos={setPagos}
            faltaPorCobrar={faltaPorCobrar}
            tasa={Number(orden.tasa_bs_por_usd)}
            zonasActivas={zonasActivas}
            repartidores={repartidores}
            cuentas={cuentas}
            bancos={bancos}
            choques={{}}
            errores={tocado ? erroresPorCampo : {}}
            facturaDuplicada={false}
          />
        </div>

        <aside className="space-y-3 lg:sticky lg:top-32 lg:self-start">
          <Tarjeta titulo="Cuadre">
            <div className="space-y-3">
              <Dato
                etiqueta="Total a cobrar"
                valor={formatearUSD(resumen.total)}
                detalle={formatearBS(resumen.total * Number(orden.tasa_bs_por_usd))}
              />
              <Dato
                etiqueta="Pagado"
                valor={formatearUSD(resumen.pagado)}
                tono={resumen.cuadra ? 'bueno' : 'malo'}
                detalle={
                  resumen.cuadra
                    ? 'Cuadra'
                    : resumen.diferencia < 0
                      ? `Faltan ${formatearUSD(Math.abs(resumen.diferencia))}`
                      : `Sobran ${formatearUSD(resumen.diferencia)}`
                }
              />
            </div>
          </Tarjeta>

          {tocado && errores.length > 0 && (
            <Alerta tono="error" titulo="Falta corregir">
              <ul className="ml-4 list-disc space-y-0.5">
                {errores.map((p, i) => (
                  <li key={i}>{p.mensaje}</li>
                ))}
              </ul>
            </Alerta>
          )}

          {avisos.length > 0 && (
            <Alerta tono="aviso" titulo="Revisar">
              <ul className="ml-4 list-disc space-y-0.5">
                {avisos.map((p, i) => (
                  <li key={i}>{p.mensaje}</li>
                ))}
              </ul>
            </Alerta>
          )}

          {!soloLectura && (
            <Boton ancho onClick={() => void guardar()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
          )}
        </aside>
      </div>
    </div>
  )
}

export default EditarOrden
