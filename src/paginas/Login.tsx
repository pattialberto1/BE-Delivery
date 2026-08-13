import { useState, type FormEvent } from 'react'
import { supabase, mensajeDeError, correoDeUsuario } from '../lib/supabase'
import { useSesion } from '../contexto/Sesion'
import { Alerta, Boton, Campo, Entrada } from '../componentes/UI'

/**
 * Entrada al sistema.
 *
 * No hay registro público: los usuarios los crea la administradora desde
 * Configuración. Así nadie que consiga la dirección de la app puede meterse, y
 * la cajera y los repartidores no necesitan tener un correo.
 */
export function Login() {
  const { sinActivar, sesion, salir } = useSesion()
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: correoDeUsuario(usuario),
        password: clave,
      })
      if (error) throw error
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  // Usuario válido pero todavía sin activar: no es un error de clave, es que
  // falta que la administradora le dé permiso.
  if (sesion && sinActivar) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Alerta tono="aviso" titulo="Tu usuario todavía no tiene acceso">
            Existe, pero la administradora aún no lo activó. Avísale para que te dé acceso desde Configuración →
            Usuarios.
          </Alerta>
          <Boton variante="secundario" ancho onClick={() => void salir()}>
            Salir
          </Boton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={enviar}
        className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight text-marca-700">Broaster Express</h1>
          <p className="text-sm font-semibold text-slate-500">La Candelaria · Delivery</p>
        </div>

        {error && <Alerta tono="error">{error}</Alerta>}

        <Campo etiqueta="Usuario" requerido>
          <Entrada
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Tu nombre de usuario"
            autoFocus
          />
        </Campo>

        <Campo etiqueta="Clave" requerido>
          <Entrada
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Campo>

        <Boton type="submit" ancho disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Boton>

        <p className="text-center text-sm text-slate-500">
          ¿No tienes usuario? Pídeselo a la administradora.
        </p>
      </form>
    </div>
  )
}
