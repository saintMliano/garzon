"use client";

import { useEffect } from "react";

/**
 * Pantalla de fallo del menú.
 *
 * Al pasar la carga al servidor, un error de red o una caída de Supabase dejan
 * de ser un estado dentro del componente y pasan a ser un error del render. Sin
 * este archivo, el comensal vería la pantalla de error genérica de Next.
 *
 * `reset()` reintenta el render del servidor: es el equivalente del botón
 * "Reintentar" que existía antes.
 */
export default function ErrorMenu({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[menu] no se pudo cargar:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center min-h-screen">
      <div className="animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-red-50 flex items-center justify-center text-4xl mb-5">⚠️</div>
        <h2 className="text-xl font-bold text-stone-800">No se pudo cargar el menú</h2>
        <p className="text-stone-500 mt-2 text-sm">Revisa tu conexión e intenta nuevamente.</p>
        <button
          onClick={reset}
          className="mt-5 h-11 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm active:scale-95 transition-all"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
