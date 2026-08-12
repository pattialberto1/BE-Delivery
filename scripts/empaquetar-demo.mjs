/**
 * Aplana el build de la demo en un solo archivo HTML.
 *
 *   npx vite build --config vite.config.demo.ts
 *   node scripts/empaquetar-demo.mjs
 *
 * Incrusta el JS y el CSS dentro del HTML para que la demo se pueda abrir con
 * doble clic, mandar por WhatsApp o publicar como una sola página, sin servidor
 * ni archivos sueltos al lado.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA_BUILD = join(RAIZ, 'dist-demo')
const ARCHIVO_FINAL = join(SALIDA_BUILD, 'demo-broaster.html')

const js = readFileSync(join(SALIDA_BUILD, 'demo.js'), 'utf8')
const css = readFileSync(join(SALIDA_BUILD, 'demo.css'), 'utf8')

// `</script>` dentro del código rompería la etiqueta que lo contiene.
const jsSeguro = js.replaceAll('</script>', '<\\/script>')

const original = readFileSync(join(SALIDA_BUILD, 'demo.html'), 'utf8')

const ETIQUETA_JS = /<script[^>]*src="[^"]*demo\.js"[^>]*><\/script>/
const ETIQUETA_CSS = /<link[^>]*href="[^"]*demo\.css"[^>]*>/

// Se comprueba que las etiquetas existan antes de reemplazarlas. Buscar
// "demo.js" en el resultado no serviría: el propio código incrustado menciona
// esas cadenas y daría un falso positivo.
for (const [nombre, patron] of [
  ['demo.js', ETIQUETA_JS],
  ['demo.css', ETIQUETA_CSS],
]) {
  if (!patron.test(original)) {
    console.error(`No se encontró la etiqueta que carga ${nombre}. ¿Cambió la salida del build?`)
    process.exit(1)
  }
}

const html = original
  .replace(ETIQUETA_JS, () => `<script type="module">${jsSeguro}</script>`)
  .replace(ETIQUETA_CSS, () => `<style>${css}</style>`)

writeFileSync(ARCHIVO_FINAL, html)

const kb = (Buffer.byteLength(html) / 1024).toFixed(0)
console.log(`Listo: ${ARCHIVO_FINAL} (${kb} KB, un solo archivo)`)
