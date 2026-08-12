import { useState, type FormEvent } from 'react'
import { supabase, mensajeDeError } from '../lib/supabase'
import { useSesion } from '../contexto/Sesion'
import { Alerta, Boton, Campo, Entrada } from '../componentes/UI'

export function Login() {
  const { sinActivar, sesion, salir } = useSesion()
  const [modo, setModo] = useState<'entrar' | 'registrarse'>('entrar')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setError(null)
    setAviso(null)
    setEnviando(true)

    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({
          email: correo,
          password: clave,
          options: { data: { nombre } },
        })
        if (error) throw error
        setAviso('Cuenta creada. Un administrador tiene que activarla antes de que puedas entrar.')
        setModo('entrar')
      }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  // Usuario autenticado pero todavía sin activar: no es un error de clave,
  // es que falta que un admin le dé permiso.
  if (sesion && sinActivar) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Alerta tono="aviso" titulo="Cuenta pendiente de activación">
            Tu usuario ya existe pero un administrador todavía no lo activó. Avísale para que te dé acceso desde
            Configuración → Usuarios.
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
      <form onSubmit={enviar} className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight text-marca-700">Broaster Express</h1>
          <p className="text-sm font-semibold text-slate-500">La Candelaria · Delivery</p>
        </div>

        {error && <Alerta tono="error">{error}</Alerta>}
        {aviso && <Alerta tono="exito">{aviso}</Alerta>}

        {modo === 'registrarse' && (
          <Campo etiqueta="Nombre" requerido>
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="name" />
          </Campo>
        )}

        <Campo etiqueta="Correo" requerido>
          <Entrada
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
          />
        </Campo>

        <Campo etiqueta="Clave" requerido>
          <Entrada
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
            minLength={6}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
        </Campo>

        <Boton type="submit" ancho disabled={enviando}>
          {enviando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </Boton>

        <Boton
          type="button"
          variante="fantasma"
          ancho
          onClick={() => {
            setModo(modo === 'entrar' ? 'registrarse' : 'entrar')
            setError(null)
            setAviso(null)
          }}
        >
          {modo === 'entrar' ? '¿Usuario nuevo? Crear cuenta' : 'Ya tengo cuenta'}
        </Boton>
      </form>
    </div>
  )
}
