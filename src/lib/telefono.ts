/**
 * Utilidades de teléfono móvil chileno.
 *
 * El problema que resuelven: el comensal escribe su número en el checkout con el
 * celular en una mano y sin ganas de pensar. Copia y pega desde sus contactos
 * (`+56 9 1234 5678`), lo dicta con guiones, o lo marca con el `0` de discado
 * antiguo. Si el formulario le rechaza cualquiera de esas formas, abandona el
 * pedido: el campo es una fricción que no vende nada.
 *
 * Por eso la regla es asimétrica: LIBERAL al recibir, ESTRICTO al guardar. Se
 * acepta casi cualquier forma que un chileno reconozca como su celular, pero en
 * la base siempre queda E.164 (`+56912345678`), que es lo único que entiende un
 * proveedor de SMS o un `wa.me/`.
 *
 * El `+56` del formulario está impreso al costado del input, no dentro: el
 * comensal escribe 9 dígitos. Aun así se tolera que lo repita al pegar, porque
 * pegar el número completo es exactamente lo que hace la gente.
 */

/** Un móvil chileno son 9 dígitos: el `9` de red móvil más 8 de abonado. */
export const LARGO_NACIONAL = 9;

/** Prefijo internacional de Chile, sin `+`. */
const PREFIJO_PAIS = "56";

/** Deja solo `0-9`. Todo lo demás —espacios, guiones, puntos, paréntesis, `+`— es adorno. */
export function soloDigitos(entrada: string): string {
  return (entrada ?? "").replace(/\D/g, "");
}

/**
 * Quita los prefijos que la gente agrega por costumbre y que no son parte del
 * número nacional.
 *
 * Se comprueba el largo además del prefijo a propósito: un `56` suelto solo es
 * código de país si lo que sobra son los 9 dígitos nacionales; si no, es parte
 * del número que el comensal todavía está escribiendo y sacárselo le borraría
 * lo que acaba de tipear. Mismo criterio con el `0` de discado antiguo.
 */
function quitarPrefijos(digitos: string): string {
  if (digitos.startsWith(PREFIJO_PAIS) && digitos.length === PREFIJO_PAIS.length + LARGO_NACIONAL) {
    return digitos.slice(PREFIJO_PAIS.length);
  }
  if (digitos.startsWith("0") && digitos.length === LARGO_NACIONAL + 1) {
    return digitos.slice(1);
  }
  return digitos;
}

/**
 * Devuelve el número en E.164 (`+569XXXXXXXX`) o `null` si no es un móvil chileno.
 *
 * Rechaza los fijos (`32 212 3456` de Valparaíso, `2 2123 4567` de Santiago)
 * porque el uso real del campo es avisar "tu pedido está listo" por mensaje: un
 * fijo válido es peor que un campo vacío, porque promete un aviso que nunca llega.
 * El filtro es simple —empieza con `9`— y eso basta: en Chile todos los móviles
 * lo hacen y ningún fijo lo hace.
 */
export function normalizarTelefonoChileno(entrada: string): string | null {
  const nacional = quitarPrefijos(soloDigitos(entrada));
  if (nacional.length !== LARGO_NACIONAL) return null;
  if (!nacional.startsWith("9")) return null;
  return `+${PREFIJO_PAIS}${nacional}`;
}

/** Agrupa 9 dígitos como `9 1234 5678`, tolerando que todavía falten. */
function agrupar(nacional: string): string {
  const partes = [nacional.slice(0, 1), nacional.slice(1, 5), nacional.slice(5, 9)];
  return partes.filter(Boolean).join(" ");
}

/**
 * De `+56912345678` a `9 1234 5678`, que es como se lee un número en Chile.
 *
 * Si la entrada no es un móvil válido la devuelve intacta en vez de romper o
 * inventar: esto se usa para MOSTRAR datos ya guardados, y un número viejo con
 * formato raro tiene que seguir viéndose tal como está en la base, no desaparecer.
 */
export function formatearTelefonoChileno(e164: string): string {
  const normalizado = normalizarTelefonoChileno(e164);
  if (!normalizado) return e164;
  return agrupar(normalizado.slice(1 + PREFIJO_PAIS.length));
}

/**
 * Formateo progresivo para el `onChange` del input.
 *
 * Va en el camino de cada tecla, así que no puede lanzar nunca: ante cualquier
 * basura devuelve lo que pueda rescatar. Y corta a 9 dígitos en vez de rechazar
 * el excedente, porque un `maxLength` del navegador no protege del pegado.
 *
 * A diferencia de `normalizarTelefonoChileno`, acá los prefijos se descartan sin
 * mirar el largo: quien pega `+56 9 1234 5678` desde sus contactos tiene que ver
 * su número, no un `56 9123 4567` corrido de lugar. El costo es que teclear
 * `5`, `6` deja el campo vacío, y es un costo barato: ningún móvil empieza con 5.
 *
 * Es idempotente —reaplicarlo sobre su propia salida no la cambia— porque React
 * reescribe el valor del input en cada render y un formateo inestable haría
 * saltar el cursor. Esa es la razón del bucle: descartar el prefijo UNA sola vez
 * no alcanza, porque al recortar a 9 dígitos puede quedar otro `56` al frente
 * (`5656912345678` -> `569123456`) y la segunda pasada daría un valor distinto.
 * Cada vuelta consume al menos un dígito, así que siempre termina.
 */
export function formatearMientrasEscribe(entrada: string): string {
  let digitos = soloDigitos(entrada);
  while (digitos.startsWith(PREFIJO_PAIS) || digitos.startsWith("0")) {
    digitos = digitos.startsWith(PREFIJO_PAIS) ? digitos.slice(PREFIJO_PAIS.length) : digitos.slice(1);
  }
  return agrupar(digitos.slice(0, LARGO_NACIONAL));
}
