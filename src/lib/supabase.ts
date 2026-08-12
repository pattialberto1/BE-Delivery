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
  if (texto.includes('Failed to fetch') || texto.includes('NetworkError')) {
    return 'No hay conexión con el servidor. Revisa el internet e intenta de nuevo.'
  }

  return texto
}
