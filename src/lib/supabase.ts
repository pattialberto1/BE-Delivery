import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Si falta la configuración, la app arranca igual y muestra una pantalla que
 * explica qué hacer. Es mucho más útil que una pantalla en blanco con un error
 * en la consola para quien está montando esto por primera vez.
 */
export const configurado = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'sin-configurar', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

/** Bucket privado donde viven las capturas de pago. */
export const BUCKET_CAPTURAS = 'capturas'

/**
 * Dominio interno para quienes entran sin correo.
 *
 * Supabase necesita un correo para identificar a cada usuario, pero la cajera y
 * los repartidores no tienen por qué tener uno. La app le pega este dominio al
 * nombre de usuario y nadie se entera: no se envía correo a estas direcciones
 * nunca.
 */
export const DOMINIO_INTERNO = 'broaster.local'

/** Convierte lo tecleado en el campo "Usuario" al correo que espera Supabase. */
export function correoDeUsuario(entrada: string): string {
  const limpio = entrada.trim().toLowerCase()
  // Quien tenga correo real (el dueño) puede seguir entrando con él.
  return limpio.includes('@') ? limpio : `${limpio}@${DOMINIO_INTERNO}`
}

/**
 * Crea un usuario sin desloguear a quien lo está creando.
 *
 * `signUp` deja la sesión del usuario recién creado, así que la administradora
 * perdería la suya en el acto. Por eso se usa un cliente aparte que no guarda
 * sesión: crea la cuenta y se descarta.
 *
 * Se hace desde el navegador a propósito, con la clave pública. La alternativa
 * sería la clave de servicio, que da acceso total a la base y no puede vivir en
 * el navegador de una tablet que está todo el día encendida en el local.
 */
export async function crearUsuario(datos: {
  usuario: string
  clave: string
  nombre: string
}): Promise<string> {
  const efimero = createClient(url ?? 'http://localhost', anonKey ?? 'sin-configurar', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data, error } = await efimero.auth.signUp({
    email: correoDeUsuario(datos.usuario),
    password: datos.clave,
    options: { data: { nombre: datos.nombre } },
  })

  if (error) throw error
  if (!data.user) throw new Error('No se pudo crear el usuario.')
  return data.user.id
}

/**
 * Sube una captura y devuelve su ruta dentro del bucket.
 *
 * Las agrupa por fecha para que el almacenamiento siga siendo navegable a mano
 * dentro de un año, cuando haya decenas de miles de imágenes.
 */
export async function subirCaptura(archivo: File, fechaOperativa: string): Promise<string> {
  const extension = archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ruta = `${fechaOperativa}/${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage.from(BUCKET_CAPTURAS).upload(ruta, archivo, {
    contentType: archivo.type || 'image/jpeg',
    upsert: false,
  })

  if (error) throw new Error(`No se pudo subir la captura: ${error.message}`)
  return ruta
}

/** URL temporal para ver una captura. El bucket es privado, no hay link fijo. */
export async function urlDeCaptura(ruta: string, segundos = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET_CAPTURAS).createSignedUrl(ruta, segundos)
  if (error) return null
  return data.signedUrl
}

/** Traduce los errores de Postgres a algo que la cajera pueda entender y actuar. */
export function mensajeDeError(error: unknown): string {
  if (!error) return 'Ocurrió un error desconocido.'

  const posible = error as { message?: string; code?: string; details?: string }
  const texto = posible.message ?? String(error)

  if (texto.includes('pagos_referencia_unica')) {
    return 'Esa referencia ya fue cargada antes. Revisa si el cliente mandó la misma captura dos veces.'
  }
  if (texto.includes('factura_unica_por_dia')) {
    return 'Ese número de factura ya está cargado hoy.'
  }
  if (texto.includes('ya está cerrado')) {
    return texto
  }
  if (texto.includes('row-level security') || posible.code === '42501') {
    return 'Tu usuario no tiene permiso para hacer esto.'
  }
  // La app trae una columna que la base todavía no tiene: quedó una migración
  // sin correr. Sin este mensaje el error llega como jerga de PostgREST y
  // parece que la app se cayó, cuando lo que falta es un archivo de SQL.
  if (
    posible.code === 'PGRST204' ||
    posible.code === '42703' ||
    texto.includes('schema cache') ||
    (texto.includes('column') && texto.includes('does not exist'))
  ) {
    return `La base de datos está desactualizada: falta correr una migración en Supabase (SQL Editor → carpeta supabase/migrations, en orden). Detalle técnico: ${texto}`
  }
  if (texto.includes('Failed to fetch') || texto.includes('NetworkError')) {
    return 'No hay conexión con el servidor. Revisa el internet e intenta de nuevo.'
  }
  if (texto.includes('Invalid login credentials')) {
    return 'Usuario o clave incorrectos.'
  }
  if (texto.includes('User already registered') || texto.includes('already been registered')) {
    return 'Ese nombre de usuario ya existe. Elige otro.'
  }
  if (texto.includes('Password should be at least')) {
    return 'La clave es muy corta: tiene que tener al menos 6 caracteres.'
  }
  if (texto.includes('Email address') && texto.includes('invalid')) {
    return 'Ese nombre de usuario tiene caracteres que no se admiten. Usa solo letras y números, sin espacios.'
  }

  return texto
}
