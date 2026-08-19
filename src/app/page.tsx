import type { Metadata } from "next";
import Link from "next/link";
import { DIAS_GRACIA, DIAS_PRUEBA } from "@/lib/suscripcion";

/**
 * Landing de la plataforma. A diferencia del resto del sitio, acá el lector no
 * es el comensal sino el DUEÑO de un local: la página tiene que responder qué
 * hace el sistema, cuánto cuesta y qué no hace, en ese orden.
 *
 * Regla que hereda de `plan/PITCH-VENTAS.md`: **no se promete nada que no se
 * pueda demostrar en vivo**. Si una función se agrega o se saca del producto,
 * se agrega o se saca de acá el mismo día.
 */

export const metadata: Metadata = {
  title: "Garzón Digital | Pedidos por QR para tu local, sin comisiones",
  description:
    "Tus clientes piden desde la mesa con su teléfono y el pedido llega al instante a la cocina. Sin comisión por venta: tú cobras en tu caja, con tu boleta. $29.900 al mes por local.",
  openGraph: {
    title: "Garzón Digital — pedidos por QR para tu local",
    description:
      "Pedidos desde la mesa, tablero de cocina en tiempo real y reportes de venta. Sin comisión por venta y sin contrato de permanencia.",
    type: "website",
  },
};

/** Lo que el sistema hace hoy. Cada punto se puede mostrar funcionando. */
const FUNCIONES = [
  {
    titulo: "Carta por QR, sin app ni registro",
    desc: "El cliente escanea y ve la carta con fotos, descripción y precio. No descarga nada ni deja sus datos.",
  },
  {
    titulo: "Tablero de cocina en tiempo real",
    desc: "El pedido aparece solo y suena. Si el wifi del local bloquea la conexión en vivo, la pantalla se refresca igual.",
  },
  {
    titulo: "Reportes de venta",
    desc: "Pedidos, venta, ticket promedio, productos más vendidos y tiempos reales de cocina. Se exporta a CSV para el contador.",
  },
  {
    titulo: "Tú administras tu menú",
    desc: "Cambiar precios, agotar un producto o subir fotos toma segundos, desde tu propio panel y sin llamar a nadie.",
  },
  {
    titulo: "Tu marca en la carta",
    desc: "Tu logo y tus colores. El sistema revisa que el texto se lea sobre el color que elijas.",
  },
  {
    titulo: "Propina sugerida",
    desc: "El cliente elige un porcentaje sobre su total y queda anotado en la comanda. La cobras tú, en tu caja.",
  },
];

const PASOS = [
  { n: "1", label: "El cliente escanea el QR de su mesa" },
  { n: "2", label: "Elige de la carta y confirma su pedido" },
  { n: "3", label: "El pedido aparece en la pantalla de la cocina" },
  { n: "4", label: "Marcas “listo” y el cliente lo ve en su teléfono" },
];

/**
 * Los límites, dichos en la página y no en la segunda semana de uso. Un local
 * que descubre esto solo se siente engañado; uno al que se lo dijimos de
 * entrada confía en el resto.
 */
const LIMITES = [
  "No cobra en línea ni emite boletas: no se integra con el SII.",
  "No se conecta con la caja registradora ni imprime comandas.",
  "No lleva inventario: agotar un producto es un botón manual.",
  "No hace delivery ni se integra con apps de reparto.",
  "No maneja cuenta abierta por mesa ni divide la cuenta.",
  "No funciona sin internet.",
];

const INCLUYE = [
  "Carta por QR ilimitada, con tus fotos y tu marca",
  "Tablero de cocina en tiempo real, en las pantallas que necesites",
  "Reportes de venta y exportación a CSV",
  "Panel para administrar tu menú y tus precios",
  "Soporte por WhatsApp",
];

export default function Home() {
  const demoSlug = process.env.NEXT_PUBLIC_DEMO_SLUG || "el-lalo";

  return (
    <div className="flex flex-col min-h-screen bg-stone-50">
      {/* ===== BARRA SUPERIOR ===== */}
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-stone-50/85 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-base shadow-sm">
              🍔
            </span>
            <span className="font-bold text-stone-900 text-[15px] tracking-tight">Garzón Digital</span>
          </Link>

          <nav className="flex items-center gap-1">
            <a
              href="#funciones"
              className="hidden sm:flex px-3 py-2 rounded-lg text-[13px] font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              Qué hace
            </a>
            <a
              href="#precio"
              className="hidden sm:flex px-3 py-2 rounded-lg text-[13px] font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              Precio
            </a>
            <Link
              href="/dashboard"
              className="px-3.5 py-2 rounded-lg text-[13px] font-semibold text-stone-700 border border-stone-300 hover:border-stone-400 hover:bg-white transition-colors"
            >
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="bg-stone-950 border-b border-stone-900">
        <div className="max-w-5xl mx-auto px-5 py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="animate-fade-in text-[12px] font-semibold uppercase tracking-[0.14em] text-orange-400 mb-5">
              Pedidos por QR para locales de comida
            </p>

            <h1
              className="animate-fade-in text-3xl md:text-5xl font-black tracking-tight text-white leading-[1.08] text-balance"
              style={{ animationDelay: "80ms" }}
            >
              Tus clientes piden desde la mesa. La cocina lo ve al instante.
            </h1>

            <p
              className="animate-fade-in mt-5 text-[16px] md:text-lg text-stone-400 leading-relaxed max-w-xl"
              style={{ animationDelay: "160ms" }}
            >
              Sin comisión por venta y sin apps de por medio.{" "}
              <span className="text-stone-200 font-medium">
                La plata no pasa por la plataforma: cobras en tu caja, con tu boleta, como siempre.
              </span>
            </p>

            <div
              className="animate-fade-in mt-8 flex flex-col sm:flex-row gap-3"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                href={`/local/${demoSlug}`}
                className="group inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-[15px] shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/25 active:scale-[0.99] transition-all"
              >
                Probar la carta demo
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <a
                href="#precio"
                className="inline-flex items-center justify-center h-12 px-7 rounded-xl border border-stone-700 text-stone-300 font-semibold text-[15px] hover:border-stone-500 hover:text-white transition-colors"
              >
                Ver el plan
              </a>
            </div>

            <ul
              className="animate-fade-in mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-stone-400"
              style={{ animationDelay: "320ms" }}
            >
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> 0 % de comisión por venta
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> {DIAS_PRUEBA} días de
                prueba
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Sin contrato de permanencia
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== CÓMO FUNCIONA ===== */}
      <section className="max-w-5xl mx-auto w-full px-5 py-14 md:py-20">
        <h2 className="text-xl md:text-2xl font-black text-stone-900 tracking-tight">Cómo funciona</h2>
        <p className="text-stone-500 text-sm mt-1.5">Cuatro pasos, sin nada que instalar.</p>

        <ol className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PASOS.map((paso, i) => (
            <li
              key={paso.n}
              className="stagger-card rounded-2xl bg-white border border-stone-200/80 p-5"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className="inline-flex w-7 h-7 rounded-lg bg-orange-50 text-orange-600 text-[13px] font-black items-center justify-center tabular-nums">
                {paso.n}
              </span>
              <p className="mt-3 text-[14px] font-medium text-stone-700 leading-snug">{paso.label}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ===== QUÉ HACE ===== */}
      <section id="funciones" className="bg-white border-y border-stone-200/80 scroll-mt-14">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-20">
          <h2 className="text-xl md:text-2xl font-black text-stone-900 tracking-tight">
            Lo que incluye, en concreto
          </h2>
          <p className="text-stone-500 text-sm mt-1.5">
            Todo esto se puede ver funcionando antes de pagar nada.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-7">
            {FUNCIONES.map((f, i) => (
              <div key={f.titulo} className="stagger-card" style={{ animationDelay: `${i * 60}ms` }}>
                <h3 className="font-bold text-stone-900 text-[15px] leading-snug">{f.titulo}</h3>
                <p className="mt-1.5 text-[13.5px] text-stone-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRECIO ===== */}
      <section id="precio" className="max-w-5xl mx-auto w-full px-5 py-14 md:py-20 scroll-mt-14">
        <h2 className="text-xl md:text-2xl font-black text-stone-900 tracking-tight">Un solo plan</h2>
        <p className="text-stone-500 text-sm mt-1.5">Sin letra chica y sin cobro por volumen de ventas.</p>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-4">
          {/* Tarjeta de precio */}
          <div className="rounded-2xl bg-stone-950 text-white p-7 md:p-8">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-orange-400">
              Plan único
            </p>
            <div className="mt-4 flex items-baseline gap-2 flex-wrap">
              <span className="text-4xl md:text-5xl font-black tracking-tight tabular-nums">$29.900</span>
              <span className="text-stone-400 text-sm">al mes, por local</span>
            </div>
            <p className="mt-2 text-[13.5px] text-stone-400">
              O <strong className="text-stone-200 tabular-nums">$249.900 al año</strong> — dos meses gratis.
            </p>

            <Link
              href={`/local/${demoSlug}`}
              className="mt-7 inline-flex w-full items-center justify-center h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-[15px] shadow-lg shadow-orange-500/20 hover:shadow-xl active:scale-[0.99] transition-all"
            >
              Probar la carta demo
            </Link>

            <p className="mt-4 text-[12.5px] text-stone-500 leading-relaxed">
              La primera semana es gratis, con su fin de semana incluido. Si un pago se atrasa,
              tienes {DIAS_GRACIA} días más antes de que se pausen los pedidos: el servicio nunca se
              corta en medio de un turno.
            </p>
          </div>

          {/* Qué incluye + comparación honesta */}
          <div className="rounded-2xl bg-white border border-stone-200/80 p-7 md:p-8">
            <h3 className="font-bold text-stone-900 text-[15px]">Incluido en el plan</h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {INCLUYE.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14px] text-stone-700">
                  <svg className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-6 pt-6 border-t border-stone-200/80">
              <p className="text-[13.5px] text-stone-600 leading-relaxed">
                <strong className="text-stone-900">Sin comisión por venta.</strong> Los sistemas que
                cobran un porcentaje se llevan entre un 2 % y un 5 % de todo lo que vendes. Acá pagas
                lo mismo vendas lo que vendas.
              </p>
              <p className="mt-3 text-[13.5px] text-stone-600 leading-relaxed">
                <strong className="text-stone-900">Sin permanencia.</strong> Cancelas cuando quieras y
                tus reportes se exportan a CSV, incluso después.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== LÍMITES ===== */}
      <section className="bg-white border-y border-stone-200/80">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-20">
          <h2 className="text-xl md:text-2xl font-black text-stone-900 tracking-tight">
            Lo que todavía no hace
          </h2>
          <p className="text-stone-500 text-sm mt-1.5 max-w-xl">
            Preferimos decirlo acá y no en tu segunda semana de uso.
          </p>

          <ul className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {LIMITES.map((limite) => (
              <li key={limite} className="flex items-start gap-2.5 text-[13.5px] text-stone-500">
                <span aria-hidden className="mt-2 w-3 h-px bg-stone-300 shrink-0" />
                {limite}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== CIERRE ===== */}
      <section className="max-w-5xl mx-auto w-full px-5 py-14 md:py-20">
        <div className="rounded-2xl bg-stone-100 border border-stone-200/80 p-8 md:p-12 text-center">
          <h2 className="text-xl md:text-2xl font-black text-stone-900 tracking-tight text-balance">
            Estamos eligiendo los primeros locales
          </h2>
          <p className="mt-3 text-[14.5px] text-stone-600 max-w-lg mx-auto leading-relaxed">
            Instalación acompañada, carta cargada por nosotros y los QR de las mesas incluidos.
            Pruébalo una semana completa, con su fin de semana. Si no te sirve, no pagas nada.
          </p>
          <Link
            href={`/local/${demoSlug}`}
            className="mt-7 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-stone-900 text-white font-bold text-[14.5px] hover:bg-stone-800 active:scale-[0.99] transition-all"
          >
            Ver la carta demo
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      <footer className="border-t border-stone-200/80 py-7">
        <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[13px] text-stone-500">Garzón Digital · Viña del Mar, Chile</p>
          <div className="flex items-center gap-5">
            <Link href="/privacidad" className="text-[13px] font-medium text-stone-500 hover:text-stone-800 transition-colors">
              Privacidad
            </Link>
            <Link href="/dashboard" className="text-[13px] font-medium text-stone-500 hover:text-stone-800 transition-colors">
              Entrar a mi local
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
