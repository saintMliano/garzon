/**
 * Atajos de nota: los cambios que más se piden, para no tipearlos.
 *
 * Los usan las dos pantallas donde alguien escribe una nota de producto:
 * la comanda del garzón (`/dashboard/comanda`) y el carrito del comensal
 * (`/local/[slug]`). Están acá y no duplicados en cada una para que cambiarlos
 * sea un solo lugar.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠️ PROVISORIOS — HAY QUE ADAPTARLOS AL PRIMER MENÚ REAL
 *
 * Esta lista está pensada para una fuente de soda de sándwiches: son los
 * cambios típicos de un italiano o un chacarero. En un local que vende café y
 * pasteles no sirve ninguno, y ofrecer atajos que no aplican es peor que no
 * ofrecer ninguno — el comensal duda de si el local entiende su propia carta.
 *
 * Al instalar el primer cliente real hay que mirar su carta y decidir:
 *   a) ajustar esta lista a mano si todos los clientes se parecen, o
 *   b) moverla a una columna de `locales` (p. ej. `notas_sugeridas text[]`)
 *      editable desde `/dashboard/config`, que es lo correcto en cuanto haya
 *      dos rubros distintos.
 *
 * No se hizo (b) todavía a propósito: agrega una columna, una migración y una
 * pantalla para un problema que aún no tiene a nadie sufriéndolo.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const NOTAS_RAPIDAS = [
  "Sin mayo",
  "Sin ají",
  "Sin tomate",
  "Sin cebolla",
  "Sin palta",
  "Extra queso",
] as const;

/**
 * Agrega un atajo al texto que ya haya escrito, sin pisarlo y sin repetirlo.
 *
 * Que no repita importa: tocar dos veces el mismo atajo es fácil con el
 * teléfono en la mano, y "sin mayo, sin mayo" llega así a la cocina.
 */
export function agregarNotaRapida(actual: string, atajo: string): string {
  const base = actual.trim();
  if (base === "") return atajo;

  const yaEsta = base
    .toLowerCase()
    .split(",")
    .some((parte) => parte.trim() === atajo.toLowerCase());
  if (yaEsta) return base;

  return `${base}, ${atajo.toLowerCase()}`;
}
