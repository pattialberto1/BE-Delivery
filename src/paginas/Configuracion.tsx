import { useEffect, useState } from 'react'
import { useSesion } from '../contexto/Sesion'
import { useTasa } from '../hooks/useTasa'
import { mensajeDeError, supabase } from '../lib/supabase'
import { aNumero, formatearUSD } from '../lib/reglas'
import { ETIQUETA_ROL, type RolUsuario, type Usuario, type Zona } from '../lib/tipos'
import { Alerta, Boton, Campo, ContenedorTabla, Entrada, Seleccion, Tarjeta, Vacio } from '../componentes/UI'

export function Configuracion() {
  const { zonas, repartidores, recargarCatalogos, hoy, usuario } = useSesion()
  const { tasa, guardar: guardarTasa } = useTasa(hoy)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function reportar(e: unknown) {
    setError(mensajeDeError(e))
    setAviso(null)
  }

  // El constructor de consultas de Supabase es "thenable" pero no una Promise,
  // así que el tipo tiene que ser PromiseLike para poder pasarlo directo.
  async function correr(accion: () => PromiseLike<{ error: unknown }>, mensajeExito: string) {
    setError(null)
    setAviso(null)
    const { error } = await accion()
    if (error) return reportar(error)
    setAviso(mensajeExito)
    await recargarCatalogos()
  }

  return (
    <div className="space-y-4">
      {error && <Alerta tono="error">{error}</Alerta>}
      {aviso && <Alerta tono="exito">{aviso}</Alerta>}

      <TasaDelDia tasa={tasa} onGuardar={guardarTasa} onError={reportar} />
      <CuadroZonas zonas={zonas} onCorrer={correr} />
      <CuadroRepartidores repartidores={repartidores} onCorrer={correr} />
      <CuadroUsuarios miId={usuario?.id} onError={reportar} />
    </div>
  )
}

// ---------------------------------------------------------------------------

function TasaDelDia({
  tasa,
  onGuardar,
  onError,
}: {
  tasa: number | null
  onGuardar: (valor: number) => Promise<void>
  onError: (e: unknown) => void
}) {
  const [texto, setTexto] = useState('')

  useEffect(() => {
    setTexto(tasa ? String(tasa) : '')
  }, [tasa])

  return (
    <Tarjeta titulo="Tasa del día">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Bs por dólar" ayuda="Se usa para cuadrar los pagos en bolívares" className="w-48">
          <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal" />
        </Campo>
        <Boton
          disabled={!(aNumero(texto) > 0)}
          onClick={async () => {
            try {
              await onGuardar(aNumero(texto))
            } catch (e) {
              onError(e)
            }
          }}
        >
          Guardar tasa
        </Boton>
      </div>
      <Alerta tono="info" className="mt-3">
        Cambiar la tasa no altera las órdenes ya cargadas: cada una guarda la tasa con la que se cobró.
      </Alerta>
    </Tarjeta>
  )
}

// ---------------------------------------------------------------------------

type Correr = (accion: () => PromiseLike<{ error: unknown }>, mensaje: string) => Promise<void>

function CuadroZonas({ zonas, onCorrer }: { zonas: Zona[]; onCorrer: Correr }) {
  const [nombre, setNombre] = useState('')
  const [tarifa, setTarifa] = useState('')
  const [pago, setPago] = useState('')

  const valido = nombre.trim() && aNumero(tarifa) >= 0 && aNumero(pago) >= 0

  return (
    <Tarjeta titulo="Zonas y tarifas">
      <Alerta tono="info" className="mb-3">
        <strong>Tarifa al cliente</strong> es lo que se le cobra por el delivery. <strong>Pago al repartidor</strong> es
        lo que se le paga a él por esa carrera. La diferencia es el margen del local.
      </Alerta>

      <ContenedorTabla>
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Zona</th>
              <th className="py-2 pr-3 text-right">Cobra al cliente</th>
              <th className="py-2 pr-3 text-right">Paga al repartidor</th>
              <th className="py-2 pr-3 text-right">Margen</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {zonas.map((z) => (
              <FilaZona key={z.id} zona={z} onCorrer={onCorrer} />
            ))}
            {zonas.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Vacio>Todavía no hay zonas cargadas.</Vacio>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ContenedorTabla>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
        <Campo etiqueta="Zona nueva" className="min-w-48 flex-1">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la zona" />
        </Campo>
        <Campo etiqueta="Cobra ($)" className="w-32">
          <Entrada value={tarifa} onChange={(e) => setTarifa(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </Campo>
        <Campo etiqueta="Paga ($)" className="w-32">
          <Entrada value={pago} onChange={(e) => setPago(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </Campo>
        <Boton
          disabled={!valido}
          onClick={async () => {
            await onCorrer(
              () =>
                supabase.from('zonas').insert({
                  nombre: nombre.trim(),
                  tarifa_cliente_usd: aNumero(tarifa),
                  pago_repartidor_usd: aNumero(pago),
                  orden: zonas.length + 1,
                }),
              'Zona agregada.',
            )
            setNombre('')
            setTarifa('')
            setPago('')
          }}
        >
          Agregar
        </Boton>
      </div>
    </Tarjeta>
  )
}

function FilaZona({ zona, onCorrer }: { zona: Zona; onCorrer: Correr }) {
  const [tarifa, setTarifa] = useState(String(zona.tarifa_cliente_usd))
  const [pago, setPago] = useState(String(zona.pago_repartidor_usd))

  const cambiado = aNumero(tarifa) !== Number(zona.tarifa_cliente_usd) || aNumero(pago) !== Number(zona.pago_repartidor_usd)

  return (
    <tr className={`border-b border-slate-100 ${zona.activo ? '' : 'opacity-50'}`}>
      <td className="py-2 pr-3 font-semibold">{zona.nombre}</td>
      <td className="py-2 pr-3 text-right">
        <Entrada
          value={tarifa}
          onChange={(e) => setTarifa(e.target.value)}
          inputMode="decimal"
          className="min-h-10 w-24 text-right"
        />
      </td>
      <td className="py-2 pr-3 text-right">
        <Entrada
          value={pago}
          onChange={(e) => setPago(e.target.value)}
          inputMode="decimal"
          className="min-h-10 w-24 text-right"
        />
      </td>
      <td className="py-2 pr-3 text-right font-semibold tabular-nums">
        {formatearUSD(aNumero(tarifa) - aNumero(pago))}
      </td>
      <td className="py-2">
        <div className="flex justify-end gap-2">
          {cambiado && (
            <Boton
              className="min-h-9 px-3 text-xs"
              onClick={() =>
                onCorrer(
                  () =>
                    supabase
                      .from('zonas')
                      .update({ tarifa_cliente_usd: aNumero(tarifa), pago_repartidor_usd: aNumero(pago) })
                      .eq('id', zona.id),
                  'Tarifa actualizada.',
                )
              }
            >
              Guardar
            </Boton>
          )}
          <Boton
            variante="secundario"
            className="min-h-9 px-3 text-xs"
            onClick={() =>
              onCorrer(
                () => supabase.from('zonas').update({ activo: !zona.activo }).eq('id', zona.id),
                zona.activo ? 'Zona desactivada.' : 'Zona activada.',
              )
            }
          >
            {zona.activo ? 'Desactivar' : 'Activar'}
          </Boton>
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------

function CuadroRepartidores({
  repartidores,
  onCorrer,
}: {
  repartidores: Array<{ id: string; nombre: string; telefono: string | null; activo: boolean }>
  onCorrer: Correr
}) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')

  return (
    <Tarjeta titulo="Repartidores">
      <ul className="divide-y divide-slate-100">
        {repartidores.map((r) => (
          <li key={r.id} className={`flex items-center justify-between gap-3 py-2 ${r.activo ? '' : 'opacity-50'}`}>
            <div>
              <p className="font-semibold">{r.nombre}</p>
              {r.telefono && <p className="text-sm text-slate-500">{r.telefono}</p>}
            </div>
            <Boton
              variante="secundario"
              className="min-h-9 px-3 text-xs"
              onClick={() =>
                onCorrer(
                  () => supabase.from('repartidores').update({ activo: !r.activo }).eq('id', r.id),
                  r.activo ? 'Repartidor desactivado.' : 'Repartidor activado.',
                )
              }
            >
              {r.activo ? 'Desactivar' : 'Activar'}
            </Boton>
          </li>
        ))}
        {repartidores.length === 0 && <Vacio>Todavía no hay repartidores cargados.</Vacio>}
      </ul>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
        <Campo etiqueta="Repartidor nuevo" className="min-w-48 flex-1">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
        </Campo>
        <Campo etiqueta="Teléfono" className="w-44">
          <Entrada value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="Opcional" />
        </Campo>
        <Boton
          disabled={!nombre.trim()}
          onClick={async () => {
            await onCorrer(
              () => supabase.from('repartidores').insert({ nombre: nombre.trim(), telefono: telefono.trim() || null }),
              'Repartidor agregado.',
            )
            setNombre('')
            setTelefono('')
          }}
        >
          Agregar
        </Boton>
      </div>
    </Tarjeta>
  )
}

// ---------------------------------------------------------------------------

function CuadroUsuarios({ miId, onError }: { miId?: string; onError: (e: unknown) => void }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  async function cargar() {
    const { data, error } = await supabase.from('usuarios').select('*').order('nombre')
    if (error) return onError(error)
    setUsuarios((data ?? []) as Usuario[])
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function actualizar(id: string, cambios: Partial<Usuario>) {
    const { error } = await supabase.from('usuarios').update(cambios).eq('id', id)
    if (error) return onError(error)
    await cargar()
  }

  return (
    <Tarjeta titulo="Usuarios">
      <Alerta tono="info" className="mb-3">
        Quien se registra entra desactivado. Hay que activarlo aquí y darle su rol antes de que pueda usar la app.
      </Alerta>

      <ContenedorTabla>
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Nombre</th>
              <th className="py-2 pr-3">Rol</th>
              <th className="py-2 text-right">Estado</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const soyYo = u.id === miId
              return (
                <tr key={u.id} className={`border-b border-slate-100 ${u.activo ? '' : 'opacity-50'}`}>
                  <td className="py-2 pr-3 font-semibold">
                    {u.nombre}
                    {soyYo && <span className="ml-2 text-xs font-normal text-slate-500">(tú)</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <Seleccion
                      value={u.rol}
                      // Quitarse a uno mismo el rol de admin dejaría el sistema
                      // sin nadie que pueda administrarlo.
                      disabled={soyYo}
                      onChange={(e) => void actualizar(u.id, { rol: e.target.value as RolUsuario })}
                      className="min-h-9 w-auto text-sm"
                    >
                      {(Object.keys(ETIQUETA_ROL) as RolUsuario[]).map((rol) => (
                        <option key={rol} value={rol}>
                          {ETIQUETA_ROL[rol]}
                        </option>
                      ))}
                    </Seleccion>
                  </td>
                  <td className="py-2 text-right">
                    <Boton
                      variante="secundario"
                      className="min-h-9 px-3 text-xs"
                      disabled={soyYo}
                      onClick={() => void actualizar(u.id, { activo: !u.activo })}
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </Boton>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ContenedorTabla>
    </Tarjeta>
  )
}

export default Configuracion
