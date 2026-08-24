import Link from "next/link";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

/**
 * El 404 de todo el sitio.
 *
 * Existía `local/[slug]/not-found.tsx` para el local que no está, pero cualquier
 * ruta fuera de `/local/` caía en la pantalla por defecto de Next: fondo blanco,
 * tipografía del sistema y "This page could not be found", en inglés, en un
 * producto cuya convención es UI en español.
 *
 * Quién aterriza acá: un QR mal impreso o con una letra cambiada, un link viejo
 * que alguien guardó, o el dueño de un local escribiendo la dirección de memoria.
 * Por eso las dos salidas son las dos cosas que puede querer: la portada, o
 * entrar a su panel.
 */
export default function NoEncontrado() {
  return (
    <div className="flex flex-1 items-center justify-center min-h-dvh px-6 py-16 bg-stone-50">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-stone-100 flex items-center justify-center mb-5">
          <MagnifyingGlassIcon aria-hidden className="w-7 h-7 text-stone-400" />
        </div>

        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          Error 404
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-stone-900 text-balance">
          Esta página no existe
        </h1>
        <p className="mt-3 text-sm text-stone-600 leading-relaxed">
          Puede que el link esté mal escrito o que ya no esté disponible. Si llegaste
          escaneando un código QR, probá escanearlo de nuevo.
        </p>

        <div className="mt-7 flex flex-col sm:flex-row gap-2.5 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl btn-primario font-bold text-sm active:scale-[0.98] transition-all"
          >
            Ir a la portada
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl btn-secundario font-semibold text-sm active:scale-[0.98] transition-all"
          >
            Entrar a mi local
          </Link>
        </div>
      </div>
    </div>
  );
}
