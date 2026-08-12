/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Hora (0-23) a partir de la cual empieza a contar el día operativo nuevo. */
  readonly VITE_HORA_CORTE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
