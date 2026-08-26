import {
  BellAlertIcon,
  DevicePhoneMobileIcon,
  FireIcon,
  QrCodeIcon,
} from "@heroicons/react/24/outline";

/**
 * El recorrido del pedido, en el hueco del hero.
 *
 * Cuatro hitos enhebrados por una línea, y un pulso que la recorre encendiéndolos
 * uno a uno: el comensal escanea, elige, suena en la cocina, se prepara. Es la
 * versión **abstracta** del banner — no reproduce ninguna pantalla del producto,
 * lo cual tiene dos consecuencias que conviene tener claras: no se desfasa nunca
 * (no es espejo de nada), pero tampoco muestra el producto. Eso lo hace la
 * maqueta del tablero, justo debajo.
 *
 * **Sin JavaScript.** Solo `opacity` y `transform`, las dos propiedades que el
 * navegador mueve sin volver a pintar. La landing sigue estática (`○ /`).
 *
 * **El último fotograma es el mensaje.** `globals.css` colapsa toda animación a
 * `0.01ms` con una sola iteración cuando el sistema pide movimiento reducido, así
 * que quien tiene esa preferencia **no ve el recorrido: ve el fotograma 100 %**.
 * Por eso el ciclo termina con los cuatro hitos encendidos y la línea completa
 * —una imagen que se sostiene sola y dice lo mismo— y el reinicio ocurre al
 * principio, entre el 0 y el 4 %. Si alguien "arregla" el ciclo para que se
 * apague al final, esas personas van a ver cuatro cuadros grises.
 *
 * **Va `aria-hidden`.** No se pierde nada: la sección "Cómo funciona" cuenta este
 * mismo recorrido con palabras, más abajo en la misma página.
 *
 * **La geometría está acoplada al CSS.** El riel mide 324 px porque son tres
 * saltos de 108 (44 de nodo + 64 de separación). Si cambia el tamaño del nodo o
 * la separación, hay que cambiar `--rec-riel` en `globals.css`.
 */

const HITOS = [
  { Icono: QrCodeIcon, texto: "Escanea el QR de su mesa" },
  { Icono: DevicePhoneMobileIcon, texto: "Elige y confirma su pedido" },
  { Icono: BellAlertIcon, texto: "Suena en la cocina" },
  { Icono: FireIcon, texto: "Se prepara y sale" },
];

export default function DemoRecorrido() {
  return (
    <div aria-hidden className="rec-caja">
      {/* El riel: la línea gris de fondo, la naranja que crece encima, y el
          punto que viaja en su borde. Va detrás de los nodos. */}
      <div className="rec-riel">
        <div className="rec-progreso" />
        <div className="rec-pulso" />
      </div>

      <ol className="rec-lista">
        {HITOS.map((h, i) => (
          <li key={h.texto} className="rec-paso">
            <span className="rec-nodo">
              <h.Icono className="w-5 h-5 text-stone-500" />
              {/* La copia encendida, superpuesta. Se cruza por opacidad en vez
                  de animar el color del borde: opacidad no repinta. */}
              <span className={`rec-nodo-on rec-nodo-${i + 1}`}>
                <h.Icono className="w-5 h-5 text-orange-400" />
              </span>
            </span>
            <p className="text-sm font-medium text-stone-400 leading-snug">{h.texto}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
