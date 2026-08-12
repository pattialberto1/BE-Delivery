import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

/**
 * Build de la demo: la app real, con los datos servidos desde memoria.
 *
 * Cambia dos cosas y nada más:
 *  - `src/lib/supabase` apunta al cliente de mentira,
 *  - el punto de entrada agrega la barra para cambiar de rol.
 *
 * Sin PWA: una demo no debe instalarse ni cachearse como si fuera el sistema.
 * El resultado se aplana a un solo HTML con `scripts/empaquetar-demo.mjs`.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^(\.\.?\/)+lib\/supabase$/,
        replacement: fileURLToPath(new URL('./src/demo/supabase.ts', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: 'dist-demo',
    // Un solo archivo de cada tipo, para poder incrustarlos después.
    rollupOptions: {
      input: fileURLToPath(new URL('./demo.html', import.meta.url)),
      output: {
        codeSplitting: false,
        entryFileNames: 'demo.js',
        assetFileNames: 'demo.[ext]',
      },
    },
  },
})
