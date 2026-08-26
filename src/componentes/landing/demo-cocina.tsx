import Image from "next/image";
import {
  ArchiveBoxIcon,
  BellIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  FireIcon,
  PencilSquareIcon,
  ShoppingBagIcon,
  SparklesIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { formatPrice } from "@/lib/utils";
import { PEDIDOS_DEMO, type EstadoDemo, type PedidoDemo } from "./datos-demo";

/**
 * Réplica estática del tablero de cocina.
 *
 * **Espejo de `src/app/dashboard/page.tsx`.** Si esa pantalla cambia de
 * columnas, de acentos o de anatomía de la tarjeta, esta maqueta queda mintiendo
 * y hay que venir a corregirla. Las clases de acá se copiaron de allá a
 * propósito, no se inventaron: `dash-card rounded-2xl border-2`, el anillo azul
 * de la tarjeta nueva, el cronómetro monoespaciado, la nota en ámbar itálico.
 *
 * Tres diferencias deliberadas con el original, todas por ser una maqueta y no
 * una pantalla:
 *
 * 1. **Nada es interactivo.** En el panel de verdad cada acción es un `<button>`.
 *    Acá son `<span>`: si fueran botones, la landing sumaría una docena de
 *    paradas de tabulador que no llevan a ninguna parte.
 * 2. **El cronómetro no corre.** El original lo actualiza cada segundo desde el
 *    cliente; hacerlo acá obligaría a mandar JavaScript a una página que hoy no
 *    manda nada. Los tiempos son texto fijo, elegidos para mostrar el aviso
 *    ámbar de los 8 minutos.
 * 3. **El punto de "En vivo" no parpadea.** Una animación infinita decorativa
 *    distrae y no aporta; el `animate-pulse` del panel real está justificado
 *    porque ahí sí indica un estado que cambia.
 */

const COLUMNAS: {
  key: EstadoDemo;
  label: string;
  Icono: typeof SparklesIcon;
  acento: string;
  /** El botón de avanzar lleva el acento de la columna DESTINO, como en el panel. */
  accion: { label: string; Icono: typeof SparklesIcon; acento: string };
}[] = [
  {
    key: "nuevo",
    label: "Nuevos",
    Icono: SparklesIcon,
    acento: "from-blue-600 to-blue-700 text-white",
    accion: {
      label: "Aceptar",
      Icono: CheckCircleIcon,
      acento: "from-amber-500 to-amber-600 text-stone-900",
    },
  },
  {
    key: "aceptado",
    label: "Aceptados",
    Icono: CheckCircleIcon,
    acento: "from-amber-500 to-amber-600 text-stone-900",
    accion: {
      label: "A Cocina",
      Icono: FireIcon,
      acento: "from-orange-500 to-orange-600 text-stone-900",
    },
  },
  {
    key: "preparando",
    label: "En Cocina",
    Icono: FireIcon,
    acento: "from-orange-500 to-orange-600 text-stone-900",
    accion: {
      label: "¡Listo!",
      Icono: BellIcon,
      acento: "from-green-500 to-green-600 text-stone-900",
    },
  },
  {
    key: "listo",
    label: "Listos",
    Icono: BellIcon,
    acento: "from-green-500 to-green-600 text-stone-900",
    accion: {
      label: "Entregar",
      Icono: ArchiveBoxIcon,
      acento: "from-stone-600 to-stone-700 text-white",
    },
  },
];

function Tarjeta({ pedido, esNuevo, accion }: {
  pedido: PedidoDemo;
  esNuevo: boolean;
  accion: (typeof COLUMNAS)[number]["accion"];
}) {
  return (
    <div
      className={`dash-card rounded-2xl border-2 p-4 ${
        esNuevo ? "border-blue-800 ring-1 ring-blue-900/50" : ""
      }`}
    >
      {/* Número, mesa y cronómetro */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base font-black dash-text-primary tabular-nums">{pedido.numero}</span>
          {pedido.retiro && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-950/60 text-amber-300 text-2xs font-bold">
              <ShoppingBagIcon className="w-3 h-3 shrink-0" />
              Retiro
            </span>
          )}
          {pedido.mesa && (
            <span className="px-2 py-0.5 rounded-lg dash-bg-surface text-2xs font-semibold dash-text-secondary truncate">
              {pedido.mesa}
            </span>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs font-mono font-bold tabular-nums shrink-0 ${
            pedido.urgencia === "aviso" ? "text-amber-400" : "text-stone-500"
          }`}
        >
          <ClockIcon className="w-3.5 h-3.5 shrink-0" />
          {pedido.tiempo}
        </span>
      </div>

      {/* Quién pidió */}
      <p className="text-sm font-semibold dash-text-secondary mb-2.5 flex items-center gap-1.5">
        <span className="w-6 h-6 rounded-full dash-bg-surface flex items-center justify-center shrink-0">
          <UserIcon className="w-3.5 h-3.5" />
        </span>
        {pedido.cliente}
      </p>

      {/* Las líneas del pedido */}
      <div className="space-y-1.5 mb-3">
        {pedido.lineas.map((linea, i) => (
          <div key={i} className="flex items-start justify-between text-sm gap-2">
            <div className="flex-1 min-w-0">
              <span className="font-bold dash-text-primary text-sm">{linea.cantidad}x </span>
              <span className="dash-text-secondary text-sm">{linea.nombre}</span>
              {linea.nota && (
                <span className="text-xs text-amber-400 italic mt-0.5 flex items-start gap-1.5">
                  <PencilSquareIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {linea.nota}
                </span>
              )}
            </div>
            <span className="text-2xs dash-text-muted whitespace-nowrap tabular-nums">
              {formatPrice(linea.precio * linea.cantidad)}
            </span>
          </div>
        ))}
      </div>

      {/* Nota para todo el pedido */}
      {pedido.notaPedido && (
        <div className="dash-bg-surface rounded-xl px-3 py-2 mb-3 text-xs text-amber-300 border border-amber-900/30">
          <span className="flex items-start gap-1.5">
            <ClipboardDocumentListIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {pedido.notaPedido}
          </span>
        </div>
      )}

      {/* Total y acción */}
      {/* `flex-wrap` es la cuarta diferencia con el panel: total + "Rechazar" +
          el botón de avanzar necesitan 259 px y una columna de este tablero da
          189 px cuando las cuatro entran en el ancho de la landing. El original
          se sale y lo tapa su `overflow-x-auto`; acá los botones bajan a la
          línea siguiente, que se lee bien y no recorta nada. */}
      <div className="flex flex-wrap items-center justify-between pt-3 border-t border-stone-800 gap-x-2 gap-y-2.5">
        <span className="font-bold dash-text-primary text-base tabular-nums">
          {formatPrice(pedido.total)}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="px-2.5 py-2 rounded-lg text-2xs font-semibold text-red-400/70">
            Rechazar
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg bg-gradient-to-r ${accion.acento}`}
          >
            <accion.Icono className="w-4 h-4 shrink-0" />
            {accion.label}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DemoCocina() {
  return (
    // El fondo lo pone `.dashboard-dark` desde el marco.
    <div>
      {/* Cabecera del panel */}
      <div className="dash-header border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/icon-192.png"
              alt=""
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl shadow-lg shadow-orange-500/20 shrink-0"
            />
            <div className="min-w-0">
              <p className="font-bold dash-text-primary text-base truncate">Fuente El Lalo</p>
              <p className="text-xs dash-text-muted truncate">Garzón Digital · Panel de control</p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:block text-right">
              <p className="text-2xs dash-text-muted uppercase tracking-wider font-medium">Pedidos</p>
              <p className="text-lg font-bold dash-text-primary tabular-nums leading-tight">32</p>
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-2xs dash-text-muted uppercase tracking-wider font-medium">Venta</p>
              <p className="text-lg font-bold text-green-400 tabular-nums leading-tight">$187.200</p>
            </div>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-2xs font-semibold text-green-400 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              En vivo
            </span>
          </div>
        </div>

        {/* Las pestañas del panel */}
        <div className="mt-2.5 flex items-center gap-1 dash-bg-surface rounded-xl p-1 w-max max-w-full overflow-hidden">
          <span className="shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold text-stone-900 bg-orange-500">
            Pedidos
          </span>
          {["Comanda", "Menú", "Identidad", "Reportes", "Equipo"].map((t) => (
            <span
              key={t}
              className="shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold dash-text-secondary"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* El tablero. En pantallas chicas se desplaza dentro del marco, igual que
          hace el panel real con su `overflow-x-auto`; el marco lo recorta, así
          que la página nunca gana scroll horizontal. */}
      <div className="p-3 md:p-4 overflow-x-auto">
        <div className="flex lg:grid lg:grid-cols-4 gap-3 lg:gap-4">
          {COLUMNAS.map((col) => {
            const pedidos = PEDIDOS_DEMO[col.key];
            return (
              <div key={col.key} className="flex flex-col w-[248px] shrink-0 lg:w-auto lg:shrink">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <col.Icono className="w-5 h-5 shrink-0 dash-text-secondary" />
                    <h3 className="font-bold dash-text-primary text-base truncate">{col.label}</h3>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r tabular-nums shrink-0 ${col.acento}`}
                  >
                    {pedidos.length}
                  </span>
                </div>

                <div className="flex-1 space-y-3">
                  {pedidos.map((p) => (
                    <Tarjeta
                      key={p.numero}
                      pedido={p}
                      esNuevo={col.key === "nuevo"}
                      accion={col.accion}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
