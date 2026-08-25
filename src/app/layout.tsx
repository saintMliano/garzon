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

export const metadata: Metadata = {
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
