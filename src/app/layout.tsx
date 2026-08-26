import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Inter, autoalojada.
 *
 * Antes se pedía con un `@import` de Google Fonts en la primera línea de
 * `globals.css`. Eso encadena dos descargas antes de poder pintar —el navegador
 * tiene que bajar la hoja para descubrir que necesita otra—, sale a un tercer
 * dominio y no ajusta las métricas del sustituto, así que el texto salta cuando
 * la fuente llega. En la carta del comensal, sobre datos móviles dentro de un
 * local, eso se paga en la primera impresión.
 *
 * `adjustFontFallback` está por defecto en `true`: Next calcula un sustituto con
 * las métricas calzadas para que no haya salto mientras carga.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--fuente-inter",
});

/**
 * La URL pública del sitio, de la que cuelga `metadataBase`.
 *
 * Sin `metadataBase`, Next resuelve las imágenes de OpenGraph contra una ruta
 * relativa, y una ruta relativa no le sirve a WhatsApp: el que recibe el link
 * no está en nuestro dominio cuando su cliente va a buscar la miniatura. El
 * canal de venta declarado en `plan/PLAN_COMERCIAL.md` **es** WhatsApp, y la
 * imagen de `opengraph-image.tsx` existe justamente para que el link no llegue
 * como una línea de texto gris. Faltaba la pieza que la vuelve absoluta.
 *
 * El orden importa: la variable manda en producción; en los despliegues de
 * vista previa cae a la URL que Vercel inyecta —así una preview no anuncia
 * imágenes del dominio de producción—; y en local, a localhost.
 */
const URL_SITIO =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(URL_SITIO),
  title: "Garzón Digital | Pide sin espera",
  description:
    "Arma tu pedido, elige tu mesa, y recíbelo sin hacer fila. El garzón digital para tu local favorito.",
  keywords: ["pedidos", "comida", "fuente de soda", "viña del mar", "valparaíso"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Garzón Digital",
  },
};

// `maximumScale: 1` + `userScalable: false` bloqueaban el zoom con dos dedos en
// todo el sitio. En una carta que se lee en un celular, con letra chica y a
// veces con poca luz, eso deja fuera a quien no ve bien (WCAG 1.4.4). El zoom
// se permite.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Saltar al contenido: invisible hasta que recibe el foco.
            La cabecera de la carta tiene logo, buscador y una fila de píldoras de
            categoría que puede ser larga —un local con doce categorías son doce
            paradas—, y quien navega con teclado las recorría todas antes de
            llegar al primer producto, en cada carga. Las doce pantallas ya
            traían un `<main id="contenido">` al que apuntar. */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-xl focus:bg-stone-900 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
