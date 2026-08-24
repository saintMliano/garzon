/*
 * ⚠️ BORRADOR — NO PUBLICAR SIN REVISIÓN LEGAL.
 *
 * Este texto es un borrador redactado a partir de `plan/TELEFONO-COMENSAL.md`
 * (§4.1 a §4.6). Antes de que exista el primer teléfono real de un comensal que
 * no seas tú, un abogado tiene que revisarlo junto con el contrato de encargo
 * de tratamiento que se firma con cada local.
 *
 * Pendientes concretos antes de publicar:
 *  1. Reemplazar TODAS las apariciones del texto literal `[CONTACTO POR DEFINIR]`
 *     por el correo o el formulario real de contacto.
 *  2. Confirmar con el abogado la fecha exacta de entrada en vigencia de la
 *     Ley 21.719 y el instrumento que ampara la transferencia internacional a
 *     Estados Unidos (cláusulas tipo u otro).
 *  3. Revisar que lo que dice la página siga siendo lo que hace el código: la
 *     misma regla del pitch y de la landing — acá no se promete nada que no se
 *     pueda demostrar en vivo.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad | Garzón Digital",
  description:
    "Qué datos pedimos cuando haces un pedido por QR, para qué los usamos, cuánto duran, dónde se guardan y cómo puedes pedir que los borren.",
};

const ULTIMA_ACTUALIZACION = "19 de agosto de 2026";

/** El resumen de arriba: lo que casi nadie va a leer completo, en cuatro líneas. */
const RESUMEN = [
  "Pedimos lo mínimo para prepararte el pedido: tu nombre de pila y dónde lo recibes.",
  "El teléfono solo se pide cuando el pedido es para retiro, y se borra a los 7 días.",
  "No vendemos datos, no mandamos publicidad y no cruzamos información entre locales.",
  "Los datos son del local donde pediste. Nosotros solo ponemos el sistema.",
];

/** Lo que NO se pide. Decirlo explícito vale más que cualquier párrafo. */
const NO_PEDIMOS = ["RUT", "Correo electrónico", "Dirección", "Fecha de nacimiento", "Medios de pago"];

const NUNCA = [
  "No vendemos ni arrendamos tus datos a nadie.",
  "No cruzamos información entre locales distintos: lo que pediste en un local no lo ve otro.",
  "No usamos tus datos para publicidad de Garzón Digital.",
];

const SEGURIDAD = [
  "La conexión con el sitio va cifrada (HTTPS).",
  "Cada local está aislado dentro de la base de datos: solo puede leer lo suyo.",
  "Tu pedido lo ve únicamente el personal del local donde lo hiciste.",
];

const DERECHOS = [
  { nombre: "Acceso", desc: "saber qué datos tuyos hay." },
  { nombre: "Rectificación", desc: "corregirlos si están mal." },
  { nombre: "Supresión", desc: "pedir que los borren." },
  { nombre: "Oposición", desc: "pedir que dejen de usarlos." },
  { nombre: "Portabilidad", desc: "pedir una copia para llevártela." },
];

/** Encabezado de sección: la pregunta que la persona se está haciendo. */
function Seccion({
  id,
  titulo,
  children,
}: {
  id: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-stone-200/80 pt-9">
      <h2 className="text-lg md:text-xl font-black text-stone-900 tracking-tight text-balance">
        {titulo}
      </h2>
      <div className="mt-3.5 flex flex-col gap-3.5 text-sm text-stone-600 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function Privacidad() {
  return (
    <div className="flex flex-col min-h-dvh bg-stone-50">
      {/* ===== BARRA SUPERIOR ===== */}
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-stone-50/85 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-base shadow-sm">
              🍔
            </span>
            <span className="font-bold text-stone-900 text-base tracking-tight">Garzón Digital</span>
          </Link>

          <Link
            href="/"
            className="px-3.5 py-2 rounded-lg text-sm font-semibold text-stone-700 border border-stone-300 hover:border-stone-400 hover:bg-white transition-colors"
          >
            Volver al inicio
          </Link>
        </div>
      </header>

      {/* ===== ENCABEZADO ===== */}
      <section className="bg-stone-950 border-b border-stone-900">
        <div className="max-w-3xl mx-auto px-5 py-14 md:py-20">
          <p className="animate-fade-in text-xs font-semibold uppercase tracking-[0.14em] text-orange-400 mb-5">
            Tus datos, en simple
          </p>
          <h1
            className="animate-fade-in text-3xl md:text-4xl font-black tracking-tight text-white leading-[1.1] text-balance"
            style={{ animationDelay: "80ms" }}
          >
            Política de privacidad
          </h1>
          <p
            className="animate-fade-in mt-5 text-base text-stone-400 leading-relaxed max-w-xl"
            style={{ animationDelay: "160ms" }}
          >
            Esta página explica qué pasa con los datos que dejas al pedir por QR. Está escrita para
            que la entiendas de una sola lectura, sin abogado al lado.
          </p>
          <p
            className="animate-fade-in mt-6 text-sm text-stone-500"
            style={{ animationDelay: "240ms" }}
          >
            Última actualización: {ULTIMA_ACTUALIZACION}
          </p>
        </div>
      </section>

      {/* ===== RESUMEN ===== */}
      <section className="max-w-3xl mx-auto w-full px-5 pt-10 md:pt-14">
        <div className="rounded-2xl bg-white border border-stone-200/80 p-6 md:p-7">
          <h2 className="font-bold text-stone-900 text-base">Lo importante, en cuatro líneas</h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {RESUMEN.map((linea) => (
              <li key={linea} className="flex items-start gap-2.5 text-sm text-stone-700 leading-relaxed">
                <svg
                  aria-hidden
                  className="w-4 h-4 mt-1 shrink-0 text-orange-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {linea}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== CUERPO ===== */}
      <main className="max-w-3xl mx-auto w-full px-5 py-10 md:py-14 flex flex-col gap-9">
        <Seccion id="quien" titulo="¿Quién responde por tus datos?">
          <p>
            El <strong className="text-stone-900">local donde hiciste el pedido</strong> es el
            responsable de tus datos: es quien decide para qué los quiere y a quien le puedes
            reclamar.
          </p>
          <p>
            <strong className="text-stone-900">Garzón Digital</strong> es el encargado: ponemos el
            sistema y tratamos esos datos por cuenta del local, siguiendo sus instrucciones y solo
            para que el servicio funcione. No hacemos nada propio con ellos.
          </p>
          <p>
            Para operar usamos dos proveedores de tecnología, que actúan como sub-encargados:{" "}
            <strong className="text-stone-900">Supabase</strong> (la base de datos) y{" "}
            <strong className="text-stone-900">AWS</strong> (los servidores donde vive Supabase).
          </p>
        </Seccion>

        <Seccion id="datos" titulo="¿Qué datos guardamos?">
          <p>Solo lo que hace falta para armar tu pedido y entregártelo:</p>
          <ul className="flex flex-col gap-2.5 mt-0.5">
            {[
              ["Tu nombre de pila", "para llamarte cuando esté listo."],
              ["La mesa o el tipo de entrega", "si comes en el local o si pasas a retirar."],
              ["Los productos que pediste", "y las notas que escribiste, como “sin cebolla”."],
              [
                "Tu teléfono móvil, solo si el pedido es para retiro",
                "para poder avisarte o ubicarte cuando esté listo. Si comes en el local es opcional: no hace falta, porque estás ahí.",
              ],
            ].map(([que, para]) => (
              <li key={que} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-2.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                <span>
                  <strong className="text-stone-900">{que}</strong>: {para}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 rounded-xl bg-white border border-stone-200/80 p-5">
            <p className="text-sm text-stone-700">
              <strong className="text-stone-900">Y nada más.</strong> No te pedimos:
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {NO_PEDIMOS.map((item) => (
                <li
                  key={item}
                  className="px-2.5 py-1 rounded-lg bg-stone-100 border border-stone-200 text-sm text-stone-500 line-through decoration-stone-400"
                >
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3.5 text-sm text-stone-500 leading-relaxed">
              Tampoco necesitas crear una cuenta ni descargar nada para pedir.
            </p>
          </div>
        </Seccion>

        <Seccion id="para-que" titulo="¿Para qué los usamos?">
          <p>
            Para preparar tu pedido, entregártelo y avisarte cuando esté listo. Ese es el uso
            completo: no hay un segundo propósito escondido.
          </p>
          <p>
            El fundamento para pedirte el teléfono en los retiros es simple:{" "}
            <strong className="text-stone-900">
              es necesario para poder cumplir con ese pedido
            </strong>
            . Sin una forma de ubicarte, un retiro que nadie viene a buscar se echa a perder.
          </p>
        </Seccion>

        <Seccion id="cuanto" titulo="¿Por cuánto tiempo?">
          <p>
            <strong className="text-stone-900">
              El teléfono se borra automáticamente a los 7 días
            </strong>{" "}
            de que el pedido se cierra. No hay que pedirlo: pasa solo.
          </p>
          <p>
            El pedido en sí (qué se vendió, cuánto y cuándo) se conserva, porque es la contabilidad de
            venta del local y la base de sus reportes. Pero queda{" "}
            <strong className="text-stone-900">sin el teléfono</strong>: un registro de venta, no de
            una persona.
          </p>
        </Seccion>

        <Seccion id="donde" titulo="¿Dónde se guardan?">
          <p>
            En servidores de <strong className="text-stone-900">Supabase sobre AWS</strong>, ubicados
            en <strong className="text-stone-900">Estados Unidos</strong> (región us-east-2, Ohio).
          </p>
          <p>
            Lo decimos claro porque corresponde:{" "}
            <strong className="text-stone-900">
              eso significa que tus datos salen de Chile
            </strong>
            . Es una transferencia internacional, y preferimos que lo sepas acá y no que lo descubras
            después.
          </p>
        </Seccion>

        <Seccion id="publicidad" titulo="¿Me van a mandar promociones?">
          <p>
            <strong className="text-stone-900">Hoy no.</strong> El teléfono que dejas para un retiro
            se usa para ese pedido y para nada más. Usarlo para mandarte ofertas sería cambiarle el
            propósito al dato que nos diste, y eso no se hace.
          </p>
          <p>
            Si más adelante un local ofrece sus promociones, será con una{" "}
            <strong className="text-stone-900">casilla aparte, opcional y desmarcada</strong>, que tú
            decides marcar. Tu pedido va a funcionar exactamente igual si no la marcas, y siempre vas
            a poder pedir que te den de baja.
          </p>
        </Seccion>

        <Seccion id="nunca" titulo="Lo que nunca hacemos">
          <ul className="flex flex-col gap-2.5">
            {NUNCA.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-2.5 w-3 h-px bg-stone-300 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Seccion>

        <Seccion id="seguridad" titulo="¿Cómo los cuidamos?">
          <ul className="flex flex-col gap-2.5">
            {SEGURIDAD.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-2.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Seccion>

        <Seccion id="derechos" titulo="¿Qué derechos tienes y cómo los ejerces?">
          <p>Sobre tus datos puedes pedir:</p>
          <ul className="flex flex-col gap-2.5">
            {DERECHOS.map((d) => (
              <li key={d.nombre} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-2.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                <span>
                  <strong className="text-stone-900">{d.nombre}</strong>: {d.desc}
                </span>
              </li>
            ))}
          </ul>
          <p>
            Se piden{" "}
            <strong className="text-stone-900">al local donde hiciste el pedido</strong>, que es el
            responsable. Garzón Digital lo asiste: si el local nos lo pide, buscamos y borramos el
            dato por él.
          </p>
          <p className="text-sm text-stone-500">
            Si no sabes cómo contactar al local o prefieres escribirnos a nosotros, hazlo a{" "}
            <strong className="text-stone-700">[CONTACTO POR DEFINIR]</strong> y te ayudamos a
            encaminarlo.
          </p>
        </Seccion>


        <Seccion id="cookies" titulo="¿Usan cookies o me siguen el rastro?">
          <p>
            No. No hay Google Analytics, ni píxeles de publicidad, ni herramientas de medición de
            terceros. No te seguimos entre sitios ni armamos un perfil tuyo.
          </p>
          <p>
            La única cookie del sistema es la que mantiene la sesión iniciada del{" "}
            <strong className="text-stone-900">personal del local</strong> cuando entra a su panel.
            Si eres comensal y solo estás pidiendo desde la mesa, no se te instala ninguna.
          </p>
        </Seccion>
        <Seccion id="ley" titulo="¿Qué ley aplica?">
          <p>
            La <strong className="text-stone-900">Ley 19.628</strong>, sobre protección de la vida
            privada, que es la vigente hoy en Chile.
          </p>
          <p>
            Desde <strong className="text-stone-900">diciembre de 2026</strong> la reemplaza la{" "}
            <strong className="text-stone-900">Ley 21.719</strong>, que crea la Agencia de Protección
            de Datos Personales.
          </p>
        </Seccion>

        <Seccion id="contacto" titulo="¿Con quién hablo si algo no cuadra?">
          <p>
            Primero, con el local donde pediste: es el responsable de tus datos y quien te va a
            responder.
          </p>
          <p>
            Si tu duda es sobre el sistema, escríbenos a{" "}
            <strong className="text-stone-900">[CONTACTO POR DEFINIR]</strong>.
          </p>
          <p className="text-sm text-stone-500">
            Si esta política cambia, cambia también la fecha de última actualización que aparece
            arriba.
          </p>
        </Seccion>
      </main>

      <footer className="border-t border-stone-200/80 py-7 mt-auto">
        <div className="max-w-3xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-stone-500">Garzón Digital · Viña del Mar, Chile</p>
          <Link
            href="/"
            className="text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors"
          >
            Volver al inicio
          </Link>
        </div>
      </footer>
    </div>
  );
}
