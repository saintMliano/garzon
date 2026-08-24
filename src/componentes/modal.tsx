"use client";

import { useCallback, useEffect, useId, useRef } from "react";

/**
 * El envoltorio de diálogo que le faltaba a las cuatro ventanas del producto.
 *
 * Antes, el carrito, el checkout y los dos diálogos del panel eran un `div` con
 * `fixed inset-0`. Se veían bien y funcionaban con el dedo, pero para el
 * navegador no eran un diálogo: con el checkout abierto el tabulador seguía
 * recorriendo la carta de atrás, Escape no hacía nada, y al cerrar el foco se
 * perdía al principio de la página en vez de volver al botón que lo abrió.
 *
 * Esto NO define cómo se ve nada. El panel que le pasás por `children` conserva
 * su propio diseño —la hoja que sube desde abajo, el modal centrado, lo que
 * sea—; acá vive solo el comportamiento que los cuatro necesitaban por igual y
 * ninguno tenía.
 *
 * Qué hace, y por qué cada cosa:
 * - `role="dialog"` + `aria-modal` para que el lector de pantalla anuncie que se
 *   abrió una ventana y deje de leer lo de atrás.
 * - Atrapa el foco: Tab da la vuelta dentro del diálogo en vez de escaparse.
 * - Escape cierra, salvo que `cerrarConEscape` diga que no (el checkout mientras
 *   envía: interrumpirlo a media confirmación es peor que no poder cerrarlo).
 * - Devuelve el foco al elemento que lo abrió.
 * - Bloquea el scroll del fondo, que en móvil es lo que hacía que la carta se
 *   moviera detrás del carrito.
 */

const FOCUSABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function Modal({
  onClose,
  titulo,
  children,
  cerrarConEscape = true,
  className = "",
  onClickFondo,
}: {
  onClose: () => void;
  /**
   * El nombre accesible del diálogo: lo primero que se anuncia al abrirlo.
   * Repetí acá el título que el panel ya muestra en pantalla.
   */
  titulo: string;
  children: React.ReactNode;
  cerrarConEscape?: boolean;
  className?: string;
  /**
   * Para los diálogos en los que el propio contenedor hace de fondo oscuro y
   * cerrar tocando afuera es su gesto natural (los cuatro de la comanda, los de
   * menú). Sin esto el gesto se pierde justo donde más falta: en el celular no
   * hay Escape, así que quedaría solo el botón de cerrar.
   *
   * Los paneles de adentro ya frenan la propagación, así que el clic solo llega
   * acá cuando de verdad fue en el fondo.
   */
  onClickFondo?: React.MouseEventHandler<HTMLDivElement>;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const abridor = useRef<HTMLElement | null>(null);
  const idTitulo = useId();

  const cerrar = useCallback(() => {
    if (cerrarConEscape) onClose();
  }, [cerrarConEscape, onClose]);

  // Guarda quién abrió el diálogo antes de moverle el foco. Tiene que correr en
  // el primer render, no en la limpieza: para cuando el efecto se desmonta, el
  // elemento activo ya es otro.
  useEffect(() => {
    abridor.current = document.activeElement as HTMLElement | null;

    const primero = contenedor.current?.querySelector<HTMLElement>(FOCUSABLES);
    // `autoFocus` de React gana si el panel ya declaraba uno; si no, el foco
    // entra al primer control del diálogo y no se queda en el body.
    if (primero && !contenedor.current?.contains(document.activeElement)) {
      primero.focus();
    }

    return () => {
      // `isConnected`: si el botón que abrió el diálogo se fue con él (borrar un
      // producto, por ejemplo), enfocarlo tira un error silencioso.
      if (abridor.current?.isConnected) abridor.current.focus();
    };
  }, []);

  // El scroll del fondo. Se guarda el valor previo en vez de asumir `""`,
  // porque puede haber otro diálogo encima que ya lo había bloqueado.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar();
        return;
      }

      if (e.key !== "Tab" || !contenedor.current) return;

      const focusables = Array.from(
        contenedor.current.querySelectorAll<HTMLElement>(FOCUSABLES)
      ).filter((el) => el.offsetParent !== null); // descarta lo que está oculto

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [cerrar]);

  return (
    <div
      ref={contenedor}
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      className={className}
      onClick={onClickFondo}
    >
      {/* Espejo del título para el lector de pantalla. El panel de `children`
          dibuja el suyo visible; duplicarlo acá evita obligar a cada uno de los
          cuatro llamadores a inventarse un `id`. */}
      <span id={idTitulo} className="sr-only">
        {titulo}
      </span>
      {children}
    </div>
  );
}
