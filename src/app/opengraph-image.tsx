import { ImageResponse } from "next/og";

/**
 * La imagen que se ve cuando alguien pega el link de la landing en WhatsApp.
 *
 * El canal de venta declarado en `plan/PLAN_COMERCIAL.md` es WhatsApp, y hasta
 * ahora el `openGraph` de la landing tenía título y descripción pero ninguna
 * imagen: el link llegaba como una línea de texto gris, que al lado de
 * cualquier competidor se lee como algo improvisado.
 *
 * Se genera con `ImageResponse` en vez de subir un PNG: el precio y la promesa
 * viven en `src/lib/suscripcion.ts` y en la landing, así que un archivo estático
 * quedaría desactualizado el día que cambien y nadie se enteraría hasta verlo
 * compartido.
 */

export const alt = "Garzón Digital — pedidos por QR para tu local, sin comisiones";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c0a09",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* El mismo patrón de QR que el favicon, dibujado con divs porque
              Satori no rasteriza SVG externo ni carga imágenes locales. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#f97316",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                border: "6px solid #1c1917",
              }}
            >
              <div style={{ width: 12, height: 12, background: "#1c1917" }} />
            </div>
          </div>
          <div style={{ color: "#fafaf9", fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>
            Garzón Digital
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: "#ffffff",
              fontSize: 66,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            Tus clientes piden desde la mesa. La cocina lo ve al instante.
          </div>
          <div style={{ color: "#a8a29e", fontSize: 30, marginTop: 24, maxWidth: 820 }}>
            Sin comisión por venta: cobras en tu caja, con tu boleta.
          </div>
        </div>

        <div style={{ display: "flex", gap: 40, color: "#fb923c", fontSize: 24, fontWeight: 600 }}>
          <div style={{ display: "flex" }}>0 % de comisión</div>
          <div style={{ display: "flex" }}>Sin app ni registro</div>
          <div style={{ display: "flex" }}>Sin permanencia</div>
        </div>
      </div>
    ),
    size
  );
}
