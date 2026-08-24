"use client";

import { useCallback, useRef, useState } from "react";
import Modal from "./modal";

/**
 * El reemplazo de `window.confirm()`.
 *
 * El problema no era estético. `CLAUDE.md` pide que agotar un producto "se
 * confirme y se vea rojo, no como un texto gris al primer toque". La
 * confirmación estaba, pero como `window.confirm()`: un cuadro del navegador que
 * no se puede pintar de rojo, no lleva la marca del local, y que en Chrome de
 * Android se anuncia como "El sitio dice:". La mitad de la regla se cumplía y la
 * otra mitad la impedía el mecanismo.
 *
 * La forma de usarlo mantiene la línea de llamada casi igual que antes, que es
 * lo que evita reescribir seis pantallas:
 *
 * ```tsx
 * const { confirmar, dialogo } = useConfirmar();
 *
 * async function handleAgotar() {
 *   const ok = await confirmar({
 *     titulo: "¿Agotar este producto?",
 *     detalle: "Deja de aparecer en la carta hasta que lo repongas.",
 *     aceptar: "Sí, agotar",
 *     destructivo: true,
 *   });
 *   if (!ok) return;
 *   // ...
 * }
 *
 * return <>{dialogo}  ...</>;
 * ```
 *
 * `confirmar()` devuelve una promesa que se resuelve cuando la persona elige.
 * Cerrar con Escape, con el botón de cancelar o tocando el fondo cuenta como
 * "no": la respuesta segura ante una acción destructiva es no hacerla.
 */

export type OpcionesConfirmar = {
  titulo: string;
  detalle?: string;
  /** Texto del botón que ejecuta la acción. Por defecto, "Confirmar". */
  aceptar?: string;
  cancelar?: string;
  /**
   * Pinta la acción de rojo. Reservado para lo que el otro lado no puede
   * deshacer solo: borrar, rechazar, sacar de la carta.
   */
  destructivo?: boolean;
};

export function useConfirmar() {
  const [opciones, setOpciones] = useState<OpcionesConfirmar | null>(null);
  const resolver = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback((opts: OpcionesConfirmar) => {
    setOpciones(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const responder = useCallback((valor: boolean) => {
    setOpciones(null);
    resolver.current?.(valor);
    resolver.current = null;
  }, []);

  const dialogo = opciones ? (
    <Modal
      titulo={opciones.titulo}
      onClose={() => responder(false)}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* z-60: por encima del carrito y del checkout, que viven en z-50. Un
          "¿seguro?" que aparece debajo de la ventana que lo disparó es peor que
          no tenerlo. */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => responder(false)}
      />

      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl animate-slide-up p-6 safe-bottom sm:pb-6">
        <h2 className="text-lg font-bold text-stone-900 leading-snug text-balance">
          {opciones.titulo}
        </h2>

        {opciones.detalle && (
          <p className="mt-2 text-sm text-stone-600 leading-relaxed">{opciones.detalle}</p>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            type="button"
            onClick={() => responder(false)}
            className="px-4 py-3 sm:py-2.5 rounded-xl text-sm font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 active:scale-[0.98] transition-all"
          >
            {opciones.cancelar ?? "Cancelar"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => responder(true)}
            className={`px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-all ${
              opciones.destructivo
                ? "text-white bg-red-600 hover:bg-red-500"
                : "btn-primario"
            }`}
          >
            {opciones.aceptar ?? "Confirmar"}
          </button>
        </div>
      </div>
    </Modal>
  ) : null;

  return { confirmar, dialogo };
}
