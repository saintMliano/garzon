import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
