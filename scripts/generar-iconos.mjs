#!/usr/bin/env node
/**
 * Genera los iconos de la marca: `public/icon-192.png`, `public/icon-512.png` y
 * `src/app/icon.png` (el favicon, que Next toma por convención de nombre).
 *
 * Por qué un script y no un PNG subido a mano: los tres son el MISMO dibujo en
 * tres tamaños. Con archivos sueltos, cambiar la marca significa acordarse de
 * regenerar los tres y que ninguno quede viejo; acá se corre `npm run iconos` y
 * listo. Además queda registrado de dónde salió el dibujo, que es justo lo que
 * no se sabía del favicon anterior (era el de `create-next-app`, sin tocar
 * desde el día que se creó el proyecto).
 *
 * Sin dependencias: no hay `sharp` ni `canvas` en el proyecto y no vale la pena
 * agregar uno para esto. El PNG se arma a mano —firma, IHDR, IDAT con zlib,
 * IEND— y el dibujo se rasteriza con supermuestreo 4x para que los bordes
 * redondeados no queden dentados.
 *
 * EL DIBUJO ES PROVISORIO. Es un patrón de posicionamiento de QR sobre el
 * naranja de la marca: se lee a 16px y dice "código QR" sin explicar nada. Pero
 * la identidad visual es una decisión del dueño, no de quien escribe el código.
 * Cuando haya una marca de verdad, se cambia `dibujar()` y se vuelve a correr.
 */

import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** El naranja de la plataforma y su texto legible encima (ver `src/lib/color.ts`). */
const NARANJA = [249, 115, 22];
const TINTA = [28, 25, 23];

const SUPER = 4; // factor de supermuestreo

/**
 * Devuelve la cobertura 0..1 de tinta en el punto (x, y) del cuadrado unitario.
 * Trabajar en coordenadas 0..1 hace que el mismo dibujo sirva para cualquier
 * tamaño sin constantes mágicas por resolución.
 */
function dibujar(x, y) {
  // Marco redondeado: fuera del radio no se pinta nada (queda transparente).
  const r = 0.22;
  const dentroDelMarco =
    x >= 0 && x <= 1 && y >= 0 && y <= 1 &&
    (() => {
      const cx = Math.min(Math.max(x, r), 1 - r);
      const cy = Math.min(Math.max(y, r), 1 - r);
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    })();
  if (!dentroDelMarco) return null; // transparente

  // Patrón de posicionamiento de QR, centrado: anillo exterior + núcleo.
  // Las proporciones son las del estándar (7 módulos: 1 de anillo, 1 de aire,
  // 3 de núcleo), que es lo que lo hace reconocible aunque esté solo.
  const d = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)); // distancia Chebyshev = cuadrado
  const anilloFuera = 0.30;
  const anilloDentro = 0.30 - 0.0857; // 1 módulo de 7
  const nucleo = 0.1286; // 3 módulos de 7, a la mitad

  const esAnillo = d <= anilloFuera && d >= anilloDentro;
  const esNucleo = d <= nucleo;

  return esAnillo || esNucleo ? "tinta" : "fondo";
}

function rasterizar(tam) {
  const px = Buffer.alloc(tam * tam * 4);
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      let tinta = 0, fondo = 0, total = 0;
      for (let sy = 0; sy < SUPER; sy++) {
        for (let sx = 0; sx < SUPER; sx++) {
          const ux = (x + (sx + 0.5) / SUPER) / tam;
          const uy = (y + (sy + 0.5) / SUPER) / tam;
          const q = dibujar(ux, uy);
          total++;
          if (q === "tinta") tinta++;
          else if (q === "fondo") fondo++;
        }
      }
      const cubierto = (tinta + fondo) / total;      // opacidad del marco
      const mezcla = tinta + fondo > 0 ? tinta / (tinta + fondo) : 0; // tinta vs naranja
      const i = (y * tam + x) * 4;
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round(NARANJA[c] * (1 - mezcla) + TINTA[c] * mezcla);
      }
      px[i + 3] = Math.round(cubierto * 255);
    }
  }
  return px;
}

/* ---------- codificador PNG mínimo ---------- */

function crc32(buf) {
  // `zlib.crc32` existe desde Node 20.12. La tabla a mano es el respaldo para
  // no atarse a la versión de quien corra el script.
  if (typeof zlib.crc32 === "function") return zlib.crc32(buf) >>> 0;
  let c, tabla = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = tabla[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function png(tam, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8;  // 8 bits por canal
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filtro adaptativo
  ihdr[12] = 0; // sin entrelazado

  // Cada scanline lleva adelante su byte de filtro; 0 = sin filtrar. Para un
  // dibujo de este tamaño la diferencia de peso no justifica filtrar.
  const crudo = Buffer.alloc(tam * (tam * 4 + 1));
  for (let y = 0; y < tam; y++) {
    crudo[y * (tam * 4 + 1)] = 0;
    px.copy(crudo, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(crudo, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- salida ---------- */

const salidas = [
  ["public/icon-192.png", 192],  // declarado en el manifiesto
  ["public/icon-512.png", 512],  // declarado en el manifiesto
  ["src/app/icon.png", 180],     // favicon y touch icon, por convención de Next
];

for (const [ruta, tam] of salidas) {
  const destino = resolve(RAIZ, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  const bytes = png(tam, rasterizar(tam));
  writeFileSync(destino, bytes);
  console.log(`${ruta.padEnd(24)} ${tam}x${tam}  ${(bytes.length / 1024).toFixed(1)} kB`);
}
