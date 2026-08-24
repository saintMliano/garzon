import { ImageResponse } from "next/og";
import { getMenuPublico } from "@/lib/menu-publico";
import { variablesDeMarca } from "@/lib/color";

/**
 * La imagen que se ve cuando el dueño pega el link de su carta en WhatsApp o
 * Instagram. Es la portada de su local, no la de la plataforma.
 *
 * Antes esto salía del `logo_url` del local cuando lo había. Dos problemas: el
 * logo es cuadrado y OpenGraph pide 1200x630, así que llegaba recortado o
 * flotando en gris; y el local que no subió logo —el único cliente cargado hoy,
 * Catire Kaffe, no tiene ninguna foto— no tenía imagen ninguna. Componerla acá
 * da una portada decente en los dos casos.
 *
 * Los colores salen de `variablesDeMarca()`, la misma función que pinta la
 * carta, así que el texto sobre el color del dueño se elige por contraste WCAG
 * y no a ojo. Un local con marca amarilla recibe texto oscuro sin que nadie lo
 * piense: la regla del white-label rige también acá.
 *
 * `getMenuPublico` está envuelto en `cache()` de React, así que compartir este
 * request con `generateMetadata` no cuesta una segunda ida a la base.
 */

export const alt = "Carta del local";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Igual que en `generateMetadata`: un fallo de la base no puede tumbar la
  // imagen, porque eso rompería el link compartido y no solo su portada.
  let menu = null;
  try {
    menu = await getMenuPublico(slug);
  } catch {
    menu = null;
  }

  const nombre = menu?.local.nombre ?? "Garzón Digital";
  const bajada = menu?.local.slogan?.trim() || menu?.local.direccion || "Pide desde tu mesa";
  const marca = variablesDeMarca(menu?.local.color_primario, menu?.local.color_acento);
  const fondo = marca["--brand"];
  const texto = marca["--brand-texto"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: fondo,
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            color: texto,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: 3,
            opacity: 0.75,
          }}
        >
          CARTA DIGITAL
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              color: texto,
              fontSize: nombre.length > 22 ? 76 : 96,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -3,
              maxWidth: 1000,
            }}
          >
            {nombre}
          </div>
          <div
            style={{
              display: "flex",
              color: texto,
              fontSize: 32,
              marginTop: 26,
              opacity: 0.8,
              maxWidth: 900,
            }}
          >
            {bajada}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              border: `7px solid ${texto}`,
            }}
          >
            <div style={{ width: 16, height: 16, background: texto }} />
          </div>
          <div style={{ display: "flex", color: texto, fontSize: 26, opacity: 0.75 }}>
            Escanea, pide y recibe sin hacer fila
          </div>
        </div>
      </div>
    ),
    size
  );
}
