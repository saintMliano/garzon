/**
 * Números de la suscripción, en un solo lugar.
 *
 * La REGLA de si un local está al día vive en Postgres
 * (`situacion_suscripcion`), y ahí se queda: es el único lado que puede cortar
 * un pedido. Lo que vive acá son las dos cifras que el navegador y los
 * endpoints necesitan repetir sin contradecirla.
 *
 * Si cambia alguna, hay que cambiarla además en los tres lugares donde se le
 * promete al cliente: la landing (`src/app/page.tsx`), el pitch
 * (`plan/PITCH-VENTAS.md`) y el plan comercial.
 */

/**
 * Prueba gratis de un local nuevo. Siete días es una semana completa **con su
 * fin de semana**, que es el ciclo real de un local de comida: alcanza para que
 * el dueño vea el sistema en su día bueno y en su día flojo.
 */
export const DIAS_PRUEBA = 7;

/**
 * Días que un local sigue recibiendo pedidos después de vencer. Tiene que
 * coincidir con la constante de `situacion_suscripcion` en la base: si acá dice
 * otra cosa, el dashboard le promete al dueño un plazo que el servidor no
 * respeta.
 *
 * Con la prueba de 7 días, la exposición máxima sin cobrar es de 14.
 */
export const DIAS_GRACIA = 7;
