/**
 * El marco que envuelve las maquetas del panel en la landing.
 *
 * Existe por una razón concreta: las dos maquetas son oscuras (`#0c0a09`) y el
 * hero también lo es. Sin un borde, una barra de navegador y una sombra, la
 * réplica del tablero se funde con el fondo y deja de leerse como "una pantalla
 * del producto" para parecer una sección más de la página. El marco es lo que
 * dice "esto es una captura".
 *
 * Tres decisiones que no son de estilo:
 *
 * - **El contenido va `aria-hidden`.** Adentro hay una tabla de seis productos
 *   inventados y seis pedidos que no existen. Un lector de pantalla no tiene por
 *   qué recorrer todo eso: recibe una frase, la del `<figcaption>`, que además
 *   es la que dice que los datos son de demostración.
 * - **La ruta que muestra la píldora es la real** (`/dashboard`), no un dominio
 *   inventado. Los dominios propios son F11 y todavía no existen; poner uno acá
 *   sería prometer algo que no se puede demostrar.
 * - **`overflow-hidden`**: lo que no entra se recorta dentro del marco y nunca
 *   empuja el ancho de la página.
 *
 * El pie se colorea desde afuera (`claseCaption`) porque el marco se usa sobre
 * los dos fondos de la página: sobre blanco el piso de gris es `text-stone-500`
 * (4,87:1), pero ese mismo gris sobre el negro del hero cae a 4,28:1 y no llega
 * a AA. Sobre oscuro va `text-stone-400`.
 *
 * `pieVisible={false}` esconde ese pie de la vista pero **no lo borra**: pasa a
 * `sr-only`. La `descripcion` no es decoración, es lo único que recibe quien
 * navega con lector de pantalla —el marco entero va `aria-hidden`—, así que si
 * se quita del todo, la maqueta deja de existir para esa persona.
 */

type Props = {
  /** La ruta real que se está mostrando, p. ej. "/dashboard". */
  ruta: string;
  /** La frase que oye quien navega con lector de pantalla. Debe decir que es demo. */
  descripcion: string;
  children: React.ReactNode;
  className?: string;
  /** Color del pie. Sobre fondo oscuro hay que pasar `text-stone-400`. */
  claseCaption?: string;
  /** Con `false` el pie sigue existiendo para lectores de pantalla, pero no se ve. */
  pieVisible?: boolean;
};

export default function MarcoPanel({
  ruta,
  descripcion,
  children,
  className = "",
  claseCaption = "text-stone-500",
  pieVisible = true,
}: Props) {
  return (
    <figure className={`m-0 ${className}`}>
      <div
        aria-hidden
        className="rounded-2xl border border-stone-700/60 bg-stone-900 shadow-2xl shadow-stone-950/40 overflow-hidden"
      >
        {/* Barra del navegador */}
        <div className="flex items-center gap-3 px-3.5 py-2.5 border-b border-stone-800 bg-stone-900">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-stone-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-stone-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-stone-700" />
          </div>
          {/* `text-stone-400` y no el 500 de un navegador de verdad: sobre el
              negro de esta píldora el 500 cae a 3,63:1 y no llega a AA. */}
          <span className="flex-1 min-w-0 truncate rounded-md bg-stone-950/70 px-2.5 py-1 text-xs text-stone-400 tabular-nums">
            {ruta}
          </span>
          <span className="hidden sm:inline shrink-0 rounded-md border border-stone-700/70 px-2 py-0.5 text-xs font-medium text-stone-400">
            Datos de demostración
          </span>
        </div>

        {/* La maqueta. `dashboard-dark` es obligatorio: las clases `dash-*` de
            globals.css están definidas como descendientes de esa clase y sin
            ella no pintan nada. */}
        <div className="dashboard-dark overflow-hidden">{children}</div>
      </div>

      <figcaption className={pieVisible ? `mt-3 text-xs leading-relaxed ${claseCaption}` : "sr-only"}>
        {descripcion}
      </figcaption>
    </figure>
  );
}
