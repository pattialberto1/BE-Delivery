import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '../contexto/Sesion'
import { useTasa } from '../hooks/useTasa'
import { mensajeDeError, subirCaptura, supabase } from '../lib/supabase'
import {
  aNumero,
  calcularResumen,
  formatearBS,
  formatearUSD,
  fuerzaDeDuplicado,
  normalizarReferencia,
  referenciasCoinciden,
  tieneErrores,
  validarOrden,
  type DatosOrdenAValidar,
} from '../lib/reglas'
import type { BorradorPago, Moneda } from '../lib/tipos'
import { Alerta, Boton, Campo, Dato, Entrada, Tarjeta } from '../componentes/UI'
import { type Choque } from '../componentes/FilaPago'
import { FormularioOrden } from '../componentes/FormularioOrden'
import { formularioVacio, pagoVacio } from '../lib/borradores'

const CLAVE_BORRADOR = 'be-delivery:borrador-orden'

export function NuevaOrden() {
  const { zonas, repartidores, bancos, cuentas, hoy, usuario } = useSesion()
  const { tasa, cargando: cargandoTasa, guardar: guardarTasa } = useTasa(hoy)

  const [form, setForm] = useState(formularioVacio)
  const [pagos, setPagos] = useState<BorradorPago[]>(() => [pagoVacio()])
  const [tocado, setTocado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  // Choques contra lo ya cargado en la base, por clave de pago.
  const [choques, setChoques] = useState<Record<string, Choque | null>>({})
  const [facturaDuplicada, setFacturaDuplicada] = useState(false)

  const [tasaTexto, setTasaTexto] = useState('')
  const refFactura = useRef<HTMLInputElement>(null)

  const zonasActivas = useMemo(() => zonas.filter((z) => z.activo), [zonas])
  const zonaElegida = useMemo(() => zonas.find((z) => z.id === form.zona_id), [zonas, form.zona_id])

  // ---------------------------------------------------------------------
  // Borrador local: si se cae el internet o alguien recarga sin querer con el
  // cliente en línea, lo tecleado sigue ahí. Las capturas no se pueden guardar
  // en el navegador, así que hay que volver a adjuntarlas.
  // ---------------------------------------------------------------------

  useEffect(() => {
    try {
      const crudo = localStorage.getItem(CLAVE_BORRADOR)
      if (!crudo) return
      const guardado = JSON.parse(crudo) as { form: typeof form; pagos: BorradorPago[]; fecha: string }
      if (guardado.fecha !== hoy) {
        localStorage.removeItem(CLAVE_BORRADOR)
        return
      }
      if (guardado.form) setForm(guardado.form)
      if (guardado.pagos?.length) setPagos(guardado.pagos.map((p) => ({ ...p, archivo: undefined })))
    } catch {
      localStorage.removeItem(CLAVE_BORRADOR)
    }
  }, [hoy])

  useEffect(() => {
    const vacio = !form.numero_factura && !form.cliente_nombre && !form.direccion
    if (vacio) return
    const serializables = pagos.map(({ archivo: _archivo, ...resto }) => resto)
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ form, pagos: serializables, fecha: hoy }))
  }, [form, pagos, hoy])

  // ---------------------------------------------------------------------
  // Validación
  // ---------------------------------------------------------------------

  const datosAValidar: DatosOrdenAValidar = useMemo(
    () => ({
      tipo: form.tipo,
      facturada_aparte: form.facturada_aparte,
      numero_factura: form.numero_factura,
      cliente_nombre: form.cliente_nombre,
      direccion: form.direccion,
      zona_id: form.zona_id,
      repartidor_id: form.repartidor_id || null,
      monto_pedido_usd: form.monto_pedido_usd,
      tarifa_cliente_usd: form.tipo === 'pickup' ? 0 : (zonaElegida?.tarifa_cliente_usd ?? 0),
      tasa_bs_por_usd: tasa ?? 0,
      pagos,
    }),
    [form, zonaElegida, tasa, pagos],
  )

  const problemas = useMemo(() => validarOrden(datosAValidar), [datosAValidar])
  const resumen = useMemo(() => calcularResumen(datosAValidar), [datosAValidar])

  // Un choque de referencia avisa pero no tranca: con referencias de 4 dígitos,
  // que dos pagos distintos compartan los mismos números es normal, y dejar a la
  // cajera sin poder guardar con el cliente en línea sería peor que el problema
  // que se quiere evitar. Lo decide ella con el monto a la vista.
  const bloqueado = tieneErrores(problemas) || facturaDuplicada

  const erroresPorCampo = useMemo(() => {
    const mapa: Record<string, string> = {}
    for (const p of problemas) {
      if (p.nivel === 'error' && !mapa[p.campo]) mapa[p.campo] = p.mensaje
    }
    return mapa
  }, [problemas])

  // Lo que aún no cubre ningún pago. Solo cuenta si ya hay algo cargado: con el
  // formulario en blanco no es un faltante, es que no se ha empezado.
  const faltaPorCobrar =
    pagos.length > 0 && resumen.total > 0 && resumen.diferencia < 0 ? -resumen.diferencia : 0

  const avisos = problemas.filter((p) => p.nivel === 'aviso')
  const errores = problemas.filter((p) => p.nivel === 'error')

  // ---------------------------------------------------------------------
  // Chequeo de duplicados contra la base
  //
  // Se hace mientras se teclea, no al guardar: la idea es avisar cuando el
  // cliente todavía está en línea y se le puede pedir la captura correcta.
  // La unicidad de verdad la impone la base de datos; esto es el aviso amable.
  // ---------------------------------------------------------------------

  interface PagoExistente {
    referencia: string
    monto: number
    moneda: Moneda
    cuenta_id: string | null
    ordenes: { numero_factura: string; fecha_operativa: string }
  }

  const revisarDuplicados = useCallback(async () => {
    const conReferencia = pagos.filter((p) => normalizarReferencia(p.referencia).length >= 4)
    if (conReferencia.length === 0) {
      setChoques({})
      return
    }

    // Se compara contra los últimos días, no contra todo el histórico: una
    // referencia repetida real siempre es reciente, y así la consulta es barata.
    const desde = new Date()
    desde.setDate(desde.getDate() - 7)
    const desdeTexto = desde.toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('pagos')
      .select('referencia, monto, moneda, cuenta_id, ordenes!inner(numero_factura, fecha_operativa)')
      .not('referencia', 'is', null)
      .gte('ordenes.fecha_operativa', desdeTexto)

    if (error || !data) return

    const existentes = data as unknown as PagoExistente[]
    const encontrados: Record<string, Choque | null> = {}

    for (const pago of conReferencia) {
      const previo = existentes.find(
        (otro) =>
          otro.referencia &&
          referenciasCoinciden(otro.referencia, pago.referencia) &&
          // Dos cuentas distintas pueden repetir los mismos 4 dígitos sin que
          // eso signifique nada; solo choca dentro de la misma cuenta.
          (!pago.cuenta_id || !otro.cuenta_id || otro.cuenta_id === pago.cuenta_id),
      )

      encontrados[pago.clave] = previo
        ? {
            factura: previo.ordenes.numero_factura,
            monto: Number(previo.monto),
            moneda: previo.moneda,
            fecha: previo.ordenes.fecha_operativa,
            fuerza: fuerzaDeDuplicado(pago.referencia, aNumero(pago.monto), Number(previo.monto)),
          }
        : null
    }
    setChoques(encontrados)
  }, [pagos])

  useEffect(() => {
    const id = setTimeout(() => void revisarDuplicados(), 600)
    return () => clearTimeout(id)
  }, [revisarDuplicados])

  useEffect(() => {
    const factura = form.numero_factura.trim()
    if (!factura) {
      setFacturaDuplicada(false)
      return
    }
    const id = setTimeout(async () => {
      const { data } = await supabase
        .from('ordenes')
        .select('id')
        .eq('fecha_operativa', hoy)
        .eq('numero_factura', factura)
        .maybeSingle()
      setFacturaDuplicada(Boolean(data))
    }, 500)
    return () => clearTimeout(id)
  }, [form.numero_factura, hoy])

  // ---------------------------------------------------------------------
  // Guardar
  // ---------------------------------------------------------------------

  function limpiar() {
    setForm(formularioVacio())
    setPagos([pagoVacio()])
    setTocado(false)
    setChoques({})
    setFacturaDuplicada(false)
    localStorage.removeItem(CLAVE_BORRADOR)
    refFactura.current?.focus()
  }

  async function guardar() {
    setTocado(true)
    setErrorGuardado(null)
    setExito(null)
    // El pick up no necesita zona; el delivery sí.
    if (bloqueado || !usuario || !tasa) return
    if (form.tipo === 'delivery' && !zonaElegida) return

    setGuardando(true)
    const esPickup = form.tipo === 'pickup'
    let ordenCreada: string | null = null

    try {
      // Las capturas van primero: si una falla, no queremos una orden a medias
      // en la base esperando comprobantes que nunca llegaron.
      const rutas = await Promise.all(
        pagos.map(async (pago) => (pago.archivo ? subirCaptura(pago.archivo, hoy) : (pago.imagen_path ?? null))),
      )

      const { data: orden, error: errorOrden } = await supabase
        .from('ordenes')
        .insert({
          fecha_operativa: hoy,
          numero_factura: form.numero_factura.trim(),
          cliente_nombre: form.cliente_nombre.trim(),
          cliente_telefono: form.cliente_telefono.trim() || null,
          direccion: form.direccion.trim() || null,
          tipo: form.tipo,
          facturada_aparte: form.facturada_aparte,
          zona_id: esPickup ? null : zonaElegida!.id,
          tarifa_cliente_usd: esPickup ? 0 : zonaElegida!.tarifa_cliente_usd,
          pago_repartidor_usd: esPickup ? 0 : zonaElegida!.pago_repartidor_usd,
          repartidor_id: esPickup ? null : form.repartidor_id || null,
          monto_pedido_usd: aNumero(form.monto_pedido_usd),
          tasa_bs_por_usd: tasa,
          notas: form.notas.trim() || null,
          creada_por: usuario.id,
        })
        .select('id')
        .single()

      if (errorOrden) throw errorOrden
      ordenCreada = orden.id

      // Una comanda facturada aparte no lleva pagos acá: el cobro fue por la
      // otra caja. Insertar una lista vacía funcionaría, pero deja un viaje al
      // servidor que no hace falta.
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

      // Si los pagos fallan (por ejemplo, referencia duplicada que se coló entre
      // el aviso y el guardado), la orden se queda sin comprobantes y rompería
      // el cuadre. Mejor deshacerla y que la cajera corrija.
      if (errorPagos) {
        await supabase.from('ordenes').delete().eq('id', orden.id)
        ordenCreada = null
        throw errorPagos
      }

      setExito(`Factura ${form.numero_factura.trim()} guardada.`)
      limpiar()
    } catch (e) {
      if (ordenCreada) await supabase.from('ordenes').delete().eq('id', ordenCreada)
      setErrorGuardado(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  // ---------------------------------------------------------------------
  // Sin tasa del día no se puede cuadrar nada: se pide antes de todo.
  // ---------------------------------------------------------------------

  if (cargandoTasa) return null

  if (!tasa) {
    return (
      <Tarjeta titulo="Abrir la jornada" className="mx-auto max-w-lg">
        <div className="space-y-4">
          <Alerta tono="info">
            Antes de cargar órdenes hay que registrar la tasa del día. El delivery se cobra en dólares pero el pago
            móvil entra en bolívares, así que sin la tasa no se puede cuadrar la caja.
          </Alerta>
          <Campo etiqueta="Tasa de hoy (Bs por $)" requerido>
            <Entrada
              value={tasaTexto}
              onChange={(e) => setTasaTexto(e.target.value)}
              inputMode="decimal"
              placeholder="Ej: 36,50"
              autoFocus
            />
          </Campo>
          <Boton
            ancho
            disabled={!(aNumero(tasaTexto) > 0)}
            onClick={async () => {
              try {
                await guardarTasa(aNumero(tasaTexto))
              } catch (e) {
                setErrorGuardado(mensajeDeError(e))
              }
            }}
          >
            Guardar y empezar
          </Boton>
          {errorGuardado && <Alerta tono="error">{errorGuardado}</Alerta>}
        </div>
      </Tarjeta>
    )
  }

  return (
    <div className="space-y-4">
      {exito && <Alerta tono="exito">{exito}</Alerta>}
      {errorGuardado && <Alerta tono="error" titulo="No se pudo guardar">{errorGuardado}</Alerta>}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <FormularioOrden
            form={form}
            setForm={setForm}
            pagos={pagos}
            setPagos={setPagos}
            faltaPorCobrar={faltaPorCobrar}
            tasa={tasa}
            zonasActivas={zonasActivas}
            repartidores={repartidores}
            cuentas={cuentas}
            bancos={bancos}
            choques={choques}
            errores={tocado ? erroresPorCampo : {}}
            facturaDuplicada={facturaDuplicada}
            refFactura={refFactura}
          />
        </div>

        {/* Panel de cuadre: siempre visible mientras se teclea, para no
            descubrir el descuadre al día siguiente. */}
        <aside className="space-y-3 lg:sticky lg:top-32 lg:self-start">
          <Tarjeta titulo="Cuadre">
            <div className="space-y-3">
              {/* Cada cifra lleva su equivalente en bolívares debajo: el precio
                  está en dólares pero el cliente paga en Bs, y es el número que
                  la cajera tiene que decirle por teléfono. */}
              <Dato
                etiqueta="Pedido"
                valor={formatearUSD(resumen.montoPedido)}
                detalle={formatearBS(resumen.montoPedido * tasa)}
              />
              <Dato
                etiqueta="Delivery"
                valor={formatearUSD(resumen.tarifaDelivery)}
                detalle={
                  zonaElegida
                    ? `${formatearBS(resumen.tarifaDelivery * tasa)} · ${zonaElegida.nombre}`
                    : 'Elige la zona'
                }
              />
              <Dato
                etiqueta="Total a cobrar"
                valor={formatearUSD(resumen.total)}
                detalle={formatearBS(resumen.total * tasa)}
              />
              <Dato
                etiqueta="Pagado"
                valor={formatearUSD(resumen.pagado)}
                tono={resumen.cuadra ? 'bueno' : 'malo'}
                detalle={
                  resumen.cuadra
                    ? `${formatearBS(resumen.pagado * tasa)} · cuadra`
                    : resumen.diferencia < 0
                      ? `Faltan ${formatearUSD(Math.abs(resumen.diferencia))} (${formatearBS(Math.abs(resumen.diferencia) * tasa)})`
                      : `Sobran ${formatearUSD(resumen.diferencia)} (${formatearBS(resumen.diferencia * tasa)})`
                }
              />
              <p className="text-center text-sm text-slate-500">Tasa del día: {tasa} Bs/$</p>
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

          <div className="space-y-2">
            <Boton ancho onClick={() => void guardar()} disabled={guardando || (tocado && bloqueado)}>
              {guardando ? 'Guardando…' : 'Guardar orden'}
            </Boton>
            <Boton variante="secundario" ancho onClick={limpiar} disabled={guardando}>
              Limpiar
            </Boton>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default NuevaOrden
