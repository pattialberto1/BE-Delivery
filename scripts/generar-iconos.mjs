/**
 * Genera los íconos PNG de la PWA (los que la tablet muestra en su pantalla
 * de inicio) sin depender de ninguna herramienta de imagen instalada.
 *
 *   node scripts/generar-iconos.mjs
 *
 * Dibuja el ícono píxel a píxel y lo codifica como PNG a mano. Es más simple
 * que arrastrar una dependencia de imágenes solo para dos archivos estáticos.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = join(RAIZ, 'public')

const ROJO = [185, 28, 28] // marca-700
const ROJO_OSCURO = [153, 27, 27]
const BLANCO = [255, 255, 255]

/** Mezcla dos colores; se usa para suavizar los bordes de las figuras. */
function mezclar(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/**
 * Cobertura suavizada de un rectángulo de esquinas redondeadas.
 * Devuelve 1 dentro, 0 fuera y valores intermedios en el borde.
 *
 * Usa una distancia con signo: negativa dentro de la figura y positiva fuera.
 * Hace falta que sea con signo para que el interior quede opaco de verdad; una
 * distancia sin signo deja todo el relleno a media opacidad.
 */
function cajaRedondeada(x, y, izq, arr, der, aba, radio) {
  const mitadAncho = (der - izq) / 2
  const mitadAlto = (aba - arr) / 2
  const qx = Math.abs(x - (izq + mitadAncho)) - (mitadAncho - radio)
  const qy = Math.abs(y - (arr + mitadAlto)) - (mitadAlto - radio)
  const distancia = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radio
  return Math.min(Math.max(0.5 - distancia, 0), 1)
}

function dibujar(tamano) {
  const pixeles = Buffer.alloc(tamano * tamano * 3)
  const u = tamano / 100 // trabajar en porcentaje del lienzo

  // Caja de delivery: cuerpo, tapa y una franja vertical, todo en blanco.
  const cuerpo = { izq: 26 * u, arr: 40 * u, der: 74 * u, aba: 76 * u, r: 5 * u }
  const tapa = { izq: 20 * u, arr: 27 * u, der: 80 * u, aba: 40 * u, r: 4 * u }
  const franja = { izq: 46 * u, arr: 40 * u, der: 54 * u, aba: 76 * u, r: 0 }

  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      // Fondo con un degradado suave para que no se vea plano.
      const fondo = mezclar(ROJO, ROJO_OSCURO, y / tamano)
      let color = fondo

      const enCuerpo = cajaRedondeada(x, y, cuerpo.izq, cuerpo.arr, cuerpo.der, cuerpo.aba, cuerpo.r)
      const enTapa = cajaRedondeada(x, y, tapa.izq, tapa.arr, tapa.der, tapa.aba, tapa.r)
      const blanco = Math.max(enCuerpo, enTapa)
      if (blanco > 0) color = mezclar(color, BLANCO, blanco)

      // La franja vuelve al color del fondo, marcando la abertura de la caja.
      const enFranja = cajaRedondeada(x, y, franja.izq, franja.arr, franja.der, franja.aba, franja.r)
      if (enFranja > 0) color = mezclar(color, fondo, enFranja)

      const i = (y * tamano + x) * 3
      pixeles[i] = color[0]
      pixeles[i + 1] = color[1]
      pixeles[i + 2] = color[2]
    }
  }

  return pixeles
}

// --- Codificación PNG -------------------------------------------------------

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}

function aPNG(pixeles, tamano) {
  // Cada fila de un PNG lleva delante un byte de "filtro"; usamos 0 (ninguno).
  const conFiltro = Buffer.alloc(tamano * (tamano * 3 + 1))
  for (let y = 0; y < tamano; y++) {
    conFiltro[y * (tamano * 3 + 1)] = 0
    pixeles.copy(conFiltro, y * (tamano * 3 + 1) + 1, y * tamano * 3, (y + 1) * tamano * 3)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tamano, 0)
  ihdr.writeUInt32BE(tamano, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // color verdadero (RGB)

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(conFiltro, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(SALIDA, { recursive: true })
for (const tamano of [192, 512]) {
  const archivo = join(SALIDA, `icon-${tamano}.png`)
  writeFileSync(archivo, aPNG(dibujar(tamano), tamano))
  console.log(`Generado ${archivo}`)
}
