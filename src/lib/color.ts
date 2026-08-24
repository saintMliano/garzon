/**
 * Utilidades de color para el white-label.
 *
 * El problema que resuelven: el dueño elige libremente su color de marca en
 * `/dashboard/config`. Si elige un amarillo claro, el texto blanco sobre los
 * botones desaparece; si elige un acento pálido, los precios se vuelven
 * ilegibles sobre el fondo blanco del menú. Nadie lo revisa por él.
 *
 * En vez de restringirle la paleta, se derivan los colores de texto a partir del
 * suyo, con las fórmulas de contraste de la WCAG 2.1.
 */

/** Texto oscuro del sistema (stone-900), para cuando la marca es clara. */
export const TEXTO_OSCURO = "#1c1917";
export const TEXTO_CLARO = "#ffffff";

/** Mínimo WCAG AA para texto normal. El de texto grande (3:1) no alcanza para precios. */
export const CONTRASTE_AA = 4.5;

type Rgb = { r: number; g: number; b: number };

/** Acepta `#rgb`, `#rrggbb` y sin `#`. Devuelve null si no es un color válido. */
export function parseHex(hex: string | null | undefined): Rgb | null {
  if (!hex) return null;
  let s = hex.trim().replace(/^#/, "");
  if (s.length === 3) {
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function aHex({ r, g, b }: Rgb): string {
  const dos = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${dos(r)}${dos(g)}${dos(b)}`;
}

/** Luminancia relativa según WCAG 2.1 (0 = negro, 1 = blanco). */
export function luminancia(color: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(color.r) + 0.7152 * canal(color.g) + 0.0722 * canal(color.b);
}

/** Razón de contraste WCAG entre dos colores: de 1 (idénticos) a 21 (negro/blanco). */
export function contraste(hexA: string, hexB: string): number {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return 1;
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const oscuro = Math.min(la, lb);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * Color de texto legible ENCIMA de `fondo`. Es lo que hace que un botón amarillo
 * lleve texto oscuro y uno azul marino texto blanco, sin que el dueño lo piense.
 *
 * Primero intenta con la pareja del sistema (blanco y `#1c1917`, que se ve más
 * suave que el negro puro). Pero hay una franja de tonos medios —violetas y
 * grises alrededor de `#8c5aff`— donde **ninguna de las dos llega a AA**: el
 * máximo posible con esa pareja es 4.18:1. Ahí se escala a blanco o negro puros,
 * que sí cruzan el umbral. Verificado por barrido sobre todo el cubo RGB en
 * `tests/color.test.ts`.
 */
export function textoSobre(fondo: string): string {
  const suave =
    contraste(fondo, TEXTO_CLARO) >= contraste(fondo, TEXTO_OSCURO) ? TEXTO_CLARO : TEXTO_OSCURO;
  if (contraste(fondo, suave) >= CONTRASTE_AA) return suave;

  // Último recurso: los extremos dan el máximo contraste posible.
  return contraste(fondo, "#ffffff") >= contraste(fondo, "#000000") ? "#ffffff" : "#000000";
}

/**
 * Oscurece `color` lo justo para que sea legible sobre `fondo`.
 *
 * Se usa con el color de acento, que en el menú se aplica a TEXTO (los precios)
 * sobre fondo claro: ahí no sirve elegir entre blanco y negro, hay que conservar
 * el tono del dueño y solo bajarle el brillo hasta que se lea.
 *
 * Si ni siquiera el negro alcanza el mínimo (fondo muy oscuro), devuelve el
 * candidato más contrastado que encontró: es lo mejor disponible.
 */
export function legibleSobre(color: string, fondo: string, minimo = CONTRASTE_AA): string {
  const rgb = parseHex(color);
  if (!rgb) return TEXTO_OSCURO;
  if (contraste(color, fondo) >= minimo) return color;

  let mejor = aHex(rgb);
  let mejorContraste = contraste(mejor, fondo);

  // 20 pasos del 5% cubren de cualquier color hasta prácticamente negro.
  let actual = { ...rgb };
  for (let i = 0; i < 20; i++) {
    actual = { r: actual.r * 0.95, g: actual.g * 0.95, b: actual.b * 0.95 };
    const candidato = aHex(actual);
    const c = contraste(candidato, fondo);
    if (c > mejorContraste) {
      mejor = candidato;
      mejorContraste = c;
    }
    if (c >= minimo) return candidato;
  }
  return mejor;
}

/**
 * Mezcla dos colores en RGB, igual que `color-mix(in srgb, a X%, b)` del CSS.
 *
 * Existe para poder calcular en el servidor el mismo tinte que el navegador
 * pinta con `color-mix`, y así medir el contraste contra el fondo REAL.
 */
export function mezclar(a: string, b: string, proporcionA: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return a;
  const p = Math.min(Math.max(proporcionA, 0), 1);
  return aHex({
    r: ra.r * p + rb.r * (1 - p),
    g: ra.g * p + rb.g * (1 - p),
    b: ra.b * p + rb.b * (1 - p),
  });
}

/**
 * El tinte más oscuro sobre el que la carta escribe texto con `--accent-legible`.
 *
 * La carta no pone los precios sobre blanco puro: los pone sobre superficies
 * teñidas con la marca del local — `color-mix(in srgb, var(--brand) 12%, white)`
 * en el resumen del checkout, 10% en el control de cantidad de cada producto.
 * Un fondo teñido es más oscuro que el blanco, así que un texto oscuro que
 * apenas llegaba a 4,5:1 contra blanco cae por debajo contra el tinte: medido en
 * vivo, el número del control de cantidad daba 4,17:1.
 *
 * Calcular el acento contra el 12% lo deja legible sobre las tres superficies,
 * porque las otras dos son más claras.
 */
const TINTE_MAXIMO = 0.12;

/**
 * Las cuatro variables CSS del tenant, listas para un `style`.
 *
 * `--brand` / `--accent` son los colores tal cual los eligió el dueño;
 * `--brand-texto` y `--accent-legible` son los derivados que garantizan que se
 * pueda leer. Se calculan en el servidor para que no haya un parpadeo de color
 * al hidratar.
 */
export function variablesDeMarca(
  colorPrimario: string | null | undefined,
  colorAcento: string | null | undefined,
  fondo = "#ffffff"
): Record<string, string> {
  // Los mismos naranjas por defecto que ya usaba el producto.
  const brand = parseHex(colorPrimario) ? colorPrimario! : "#f97316";
  const accent = parseHex(colorAcento) ? colorAcento! : brand;

  // El acento se mide contra el tinte de marca y no contra `fondo` a secas: es
  // la superficie sobre la que la carta realmente lo escribe. Ver TINTE_MAXIMO.
  const superficie = mezclar(brand, fondo, TINTE_MAXIMO);

  return {
    "--brand": brand,
    "--brand-texto": textoSobre(brand),
    "--accent": accent,
    "--accent-legible": legibleSobre(accent, superficie),
  };
}
