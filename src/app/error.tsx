"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

/**
 * El error de render de todo el sitio.
 *
 * `local/[slug]/error.tsx` cubre la carta del comensal; esto cubre lo demás —el
 * panel, la landing, `/privacidad`—, que hasta ahora caía en la pantalla gris de
 * Next con un stack trace en desarrollo y nada en producción.
 *
 * `reset()` reintenta el render sin recargar la página entera: si el fallo fue
 * una consulta que no respondió, alcanza.
 *
 * No se le muestra el `digest` a la persona: no le sirve de nada y lo único que
 * comunica es que algo salió muy mal. Va a la consola, que es donde se busca.
 */
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[garzón] error de render:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center min-h-dvh px-6 py-16 bg-stone-50">
      <div className="text-center max-w-sm" role="alert">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 flex items-center justify-center mb-5">
          <ExclamationTriangleIcon aria-hidden className="w-7 h-7 text-red-500" />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-stone-900 text-balance">
          No se pudo cargar esta pantalla
        </h1>
        <p className="mt-3 text-sm text-stone-600 leading-relaxed">
          Revisá tu conexión y volvé a intentar. Si sigue pasando, el problema está de
          nuestro lado y ya lo estamos viendo.
        </p>

        <div className="mt-7 flex flex-col sm:flex-row gap-2.5 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl btn-primario font-bold text-sm active:scale-[0.98] transition-all"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl btn-secundario font-semibold text-sm active:scale-[0.98] transition-all"
          >
            Ir a la portada
          </Link>
        </div>
      </div>
    </div>
  );
}
