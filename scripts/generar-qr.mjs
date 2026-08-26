#!/usr/bin/env node
/**
 * Genera los códigos QR que van pegados en las mesas.
 *
 * Por qué un script y no una web de QR gratis: el QR **se imprime y se pega**.
 * Un QR mal generado no falla en pantalla, falla cuando un comensal con hambre
 * apunta el teléfono en un local con media luz — y para entonces ya se
 * imprimieron cuarenta. Acá quedan fijos los tres parámetros que deciden si se
 * lee o no, en vez de depender de lo que haya elegido una página cualquiera:
 *
 * 1. **SVG, no PNG.** Es vectorial: la misma imagen sirve para un adhesivo de
 *    4 cm y para un cartel de media hoja. Un PNG de una web se pixela al
 *    ampliarlo y el escáner empieza a fallar en los bordes de los módulos.
 * 2. **Corrección de errores `Q` (25%).** El nivel `L` genera un QR más chico y
 *    "más limpio", que es lo que eligen las webs por defecto. Pero estos códigos
 *    viven sobre una mesa de fuente de soda: se manchan con aceite, se rayan, se
 *    despegan de una esquina. `Q` tolera que un cuarto del código esté ilegible.
 *    El costo es un dibujo más denso, no un QR más grande al imprimir.
 * 3. **Zona de silencio de 4 módulos.** El margen blanco alrededor no es
 *    estética: sin él, muchos lectores no encuentran el código. Es el error más
 *    común al recortar un QR para que "quepa mejor" en el diseño.
 *
 * Uso:
 *   node scripts/generar-qr.mjs                          → el menú demo
 *   node scripts/generar-qr.mjs --slug catire-kaffe      → la carta de un local
 *   node scripts/generar-qr.mjs --slug el-lalo --mesas 12  → una mesa por archivo
 *   node scripts/generar-qr.mjs --url https://otro.cl/x  → una URL cualquiera
 *
 * Los archivos salen en `qr/`, que no se versiona: son material operativo de
 * cada cliente, no del repositorio.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";

/**
 * La URL pública. Si un día cambia el dominio, cambia acá y en
 * `NEXT_PUBLIC_SITE_URL` — pero ojo: **los QR ya impresos no se actualizan
 * solos**. Ese es el motivo por el que el dominio propio se compró ANTES de
 * imprimir el primero.
 */
const SITIO = process.env.NEXT_PUBLIC_SITE_URL || "https://garzondigital.cl";
const SLUG_DEMO = process.env.NEXT_PUBLIC_DEMO_SLUG || "el-lalo";

const OPCIONES_QR = {
  errorCorrectionLevel: "Q",
  margin: 4,
  color: { dark: "#1c1917", light: "#ffffff" },
};

function leerArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) args[a.slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
  }
  return args;
}

/** Nombre de archivo seguro: sin tildes, espacios ni barras. */
function nombreArchivo(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function generar(url, nombre, destino) {
  const svg = await QRCode.toString(url, { ...OPCIONES_QR, type: "svg", width: 1024 });
  const ruta = join(destino, `${nombre}.svg`);
  writeFileSync(ruta, svg, "utf8");
  return { ruta, url };
}

async function main() {
  const args = leerArgs(process.argv.slice(2));
  const destino = args.salida || "qr";
  mkdirSync(destino, { recursive: true });

  const generados = [];

  if (args.url) {
    generados.push(await generar(args.url, nombreArchivo(args.nombre || "qr"), destino));
  } else {
    const slug = args.slug || SLUG_DEMO;
    const base = `${SITIO}/local/${slug}`;
    const mesas = args.mesas ? Number(args.mesas) : 0;

    if (!Number.isFinite(mesas) || mesas < 0) {
      console.error("--mesas tiene que ser un número. Recibí:", args.mesas);
      process.exit(1);
    }

    if (mesas === 0) {
      // Sin mesa: es la carta del local a secas. Sirve para el mostrador, para
      // mandar por WhatsApp o —como acá— para mostrar la demo.
      generados.push(await generar(base, nombreArchivo(slug), destino));
    } else {
      for (let m = 1; m <= mesas; m += 1) {
        // El `?mesa=` es lo que hace que el pedido llegue a la cocina sabiendo
        // de qué mesa vino. Sin eso el garzón tiene que preguntar.
        generados.push(
          await generar(`${base}?mesa=${m}`, `${nombreArchivo(slug)}-mesa-${m}`, destino)
        );
      }
    }
  }

  for (const g of generados) console.log(`${g.ruta}\n  → ${g.url}`);
  console.log(
    `\n${generados.length} archivo(s) en '${destino}/'.` +
      "\nCorrección de errores Q (tolera 25% de daño) · zona de silencio de 4 módulos." +
      "\nAl imprimir: no recortes el margen blanco y no bajes de 3 cm de lado."
  );
}

main().catch((e) => {
  console.error("No se pudo generar el QR:", e.message);
  process.exit(1);
});
