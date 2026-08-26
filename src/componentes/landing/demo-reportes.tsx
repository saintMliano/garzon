import Image from "next/image";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { formatPrice } from "@/lib/utils";
import {
  PEDIDOS_ENTREGADOS,
  PEDIDOS_PENDIENTES,
  PEDIDOS_RECHAZADOS,
  PEDIDOS_TOTAL,
  PROPINAS_TOTAL,
  TICKET_PROMEDIO,
  TIEMPOS,
  TOP_PRODUCTOS,
  UNIDADES_MAXIMAS,
  VENTAS_POR_DIA,
  VENTA_ENTREGADA,
  VENTA_MAXIMA_DIA,
  VENTA_PENDIENTE,
  VENTA_TOTAL,
} from "./datos-demo";

/**
 * Réplica estática de la página de reportes.
 *
 * **Espejo de `src/app/dashboard/reportes/page.tsx`.** Todo lo que se ve acá
 * existe allá con las mismas clases: el gráfico de barras es el mismo `flex
 * items-end` con altura en porcentaje y sin ejes —el máximo se dice con
 * palabras en la cabecera, no con una escala—, y el medidor de la tabla es el
 * mismo degradado horizontal sobre `bg-stone-800`.
 *
 * Dos cosas que la maqueta hace distinto:
 *
 * 1. En el original cada barra es un `<button>` que se puede elegir para leer su
 *    día. Acá son `<div>`, para no meter veintiséis paradas de tabulador en la
 *    landing. La barra del 22 va dibujada como si estuviera elegida, que es la
 *    forma de mostrar esa interacción sin poder ejecutarla.
 * 2. El desglose de arriba muestra a propósito la fila que más cuesta explicar
 *    en una reunión de venta: **la propina va aparte de la venta**, porque es
 *    plata del personal y no del local. Ver `CLAUDE.md`.
 */

/** El día 22 va dibujado como elegido: 447.500 / 5.898 de ticket ≈ 76 pedidos. */
const DIA_ELEGIDO = 22;
const PEDIDOS_DIA_ELEGIDO = 76;

const PERIODOS = ["Hoy", "Ayer", "Últimos 7 días", "Este mes", "Mes pasado", "Este año"];

/** Igual que el original: se rotula uno de cada `paso` días, y siempre el último. */
const PASO_ETIQUETAS = Math.ceil(VENTAS_POR_DIA.length / 15);

export default function DemoReportes() {
  return (
    // El fondo lo pone `.dashboard-dark` desde el marco.
    <div>
      {/* Cabecera del panel */}
      <div className="dash-header border-b px-4 py-3">
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

        <div className="mt-2.5 flex items-center gap-1 dash-bg-surface rounded-xl p-1 w-max max-w-full overflow-hidden">
          {["Pedidos", "Comanda", "Menú", "Identidad"].map((t) => (
            <span
              key={t}
              className="shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold dash-text-secondary"
            >
              {t}
            </span>
          ))}
          <span className="shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold text-stone-900 bg-orange-500">
            Reportes
          </span>
          <span className="shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold dash-text-secondary">
            Equipo
          </span>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-4">
        {/* ===== PERÍODO ===== */}
        <div className="dash-card rounded-2xl border-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {PERIODOS.map((p) => (
                <span
                  key={p}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${
                    p === "Este mes"
                      ? "text-stone-900 bg-orange-500"
                      : "dash-bg-surface dash-text-secondary"
                  }`}
                >
                  {p}
                </span>
              ))}
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold dash-bg-surface dash-text-primary whitespace-nowrap">
              <ArrowDownTrayIcon className="w-4 h-4 shrink-0" />
              Exportar CSV
            </span>
          </div>
          <p className="text-xs dash-text-muted mt-3">
            Del 1 de agosto de 2026 al 26 de agosto de 2026 · hora de Chile
          </p>
        </div>

        {/* ===== LOS TRES NÚMEROS DE ARRIBA ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          <div className="dash-card rounded-2xl border-2 p-5 md:p-6 flex flex-col justify-center">
            <p className="text-xs font-semibold dash-text-muted uppercase tracking-wide">Venta total</p>
            <p className="text-4xl md:text-6xl font-bold dash-text-primary tabular-nums mt-2 leading-none">
              {formatPrice(VENTA_TOTAL)}
            </p>
            <p className="text-xs dash-text-muted mt-3">No incluye pedidos rechazados.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            <div className="dash-card rounded-2xl border-2 p-5">
              <p className="text-xs font-semibold dash-text-muted uppercase tracking-wide">Pedidos</p>
              <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                {PEDIDOS_TOTAL.toLocaleString("es-CL")}
              </p>
              <p className="text-xs dash-text-muted mt-1">Total recibidos en el período.</p>
            </div>
            <div className="dash-card rounded-2xl border-2 p-5">
              <p className="text-xs font-semibold dash-text-muted uppercase tracking-wide">
                Ticket promedio
              </p>
              <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                {formatPrice(TICKET_PROMEDIO)}
              </p>
              <p className="text-xs dash-text-muted mt-1">Promedio por pedido no rechazado.</p>
            </div>
          </div>
        </div>

        {/* ===== DESGLOSE ===== */}
        <div className="dash-card rounded-2xl border-2 p-4">
          <h3 className="font-bold dash-text-primary text-sm mb-3">Desglose del período</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl dash-bg-surface px-4 py-3 border-l-4 border-green-500">
              <p className="text-xs font-semibold dash-text-secondary">Entregados</p>
              <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                {formatPrice(VENTA_ENTREGADA)}
              </p>
              <p className="text-xs dash-text-muted mt-0.5">
                {PEDIDOS_ENTREGADOS.toLocaleString("es-CL")} pedidos · esto es lo que debería estar
                en la caja
              </p>
            </div>
            <div className="rounded-xl dash-bg-surface px-4 py-3 border-l-4 border-amber-500">
              <p className="text-xs font-semibold dash-text-secondary">Pendientes</p>
              <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                {formatPrice(VENTA_PENDIENTE)}
              </p>
              <p className="text-xs dash-text-muted mt-0.5">
                {PEDIDOS_PENDIENTES} pedidos · todavía en curso, aún no cobrados
              </p>
            </div>
            <div className="rounded-xl dash-bg-surface px-4 py-3 border-l-4 border-stone-600">
              <p className="text-xs font-semibold dash-text-secondary">Rechazados</p>
              <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                {PEDIDOS_RECHAZADOS}
              </p>
              <p className="text-xs dash-text-muted mt-0.5">
                No suman a la venta ni al ticket promedio
              </p>
            </div>
            <div className="rounded-xl dash-bg-surface px-4 py-3 border-l-4 border-sky-500">
              <p className="text-xs font-semibold dash-text-secondary">Propinas</p>
              <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                {formatPrice(PROPINAS_TOTAL)}
              </p>
              <p className="text-xs dash-text-muted mt-0.5">
                Aparte de la venta · las cobra el local en caja y son del personal
              </p>
            </div>
          </div>
        </div>

        {/* ===== TIEMPOS DE COCINA ===== */}
        <div className="dash-card rounded-2xl border-2 p-4">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h3 className="font-bold dash-text-primary text-sm">Tiempos de cocina</h3>
            <span className="text-xs dash-text-muted whitespace-nowrap tabular-nums">
              mediana de {PEDIDOS_ENTREGADOS.toLocaleString("es-CL")} pedidos
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIEMPOS.map((t) => (
              <div key={t.titulo} className="dash-bg-surface rounded-xl p-3">
                <p className="text-2xs dash-text-muted uppercase tracking-wide font-medium">
                  {t.titulo}
                </p>
                <p className="text-xl font-bold dash-text-primary tabular-nums mt-0.5">{t.valor}</p>
                <p className="text-xs dash-text-muted mt-1 leading-snug">{t.detalle}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ===== VENTAS POR DÍA ===== */}
        <div className="dash-card rounded-2xl border-2 p-4">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h3 className="font-bold dash-text-primary text-sm">
              Ventas por día{" "}
              <span className="font-normal dash-text-muted text-2xs">· sin rechazados</span>
            </h3>
            <span className="text-xs dash-text-secondary tabular-nums whitespace-nowrap">
              sáb {DIA_ELEGIDO} ago: {formatPrice(VENTA_MAXIMA_DIA)} · {PEDIDOS_DIA_ELEGIDO} pedidos
            </span>
          </div>

          {/* El original vive dentro de un `overflow-x-auto` y por eso puede
              fijarle 14 px de ancho mínimo a cada barra: si no entran, se
              desplaza. Acá el gráfico no se desplaza —está dentro de una tarjeta
              en una página—, así que en pantalla chica el mínimo baja y el hueco
              se cierra, y las veintiséis barras entran igual. */}
          <div className="flex items-end gap-px sm:gap-1 md:gap-1.5 h-44">
            {VENTAS_POR_DIA.map((d) => {
              const elegida = d.dia === DIA_ELEGIDO;
              const altura = (d.venta / VENTA_MAXIMA_DIA) * 100;
              return (
                <div
                  key={d.dia}
                  className="flex-1 h-full flex flex-col justify-end items-center min-w-[3px] sm:min-w-[8px]"
                >
                  {elegida && (
                    <span className="text-2xs dash-text-secondary tabular-nums whitespace-nowrap">
                      {formatPrice(d.venta)}
                    </span>
                  )}
                  <div
                    className={`w-full rounded-t-md ${
                      d.venta > 0
                        ? "bg-gradient-to-t from-orange-600 to-amber-400"
                        : "bg-stone-800"
                    } ${elegida ? "ring-2 ring-white/70" : ""}`}
                    style={{ height: d.venta > 0 ? `max(4px, ${altura}%)` : "3px" }}
                  />
                </div>
              );
            })}
          </div>

          {/* En el teléfono cada barra mide nueve píxeles y un "25" mide catorce:
              con la cadencia de escritorio los rótulos se pisan entre sí. Por eso
              en pantalla chica se rotula uno de cada cuatro días y no uno de cada
              dos, y el último no se fuerza: el 26 cae pegado al 25 y se pisan. Es
              la misma idea del original —rotular de a saltos para que se lean—,
              calculada para el ancho que hay. */}
          <div className="flex gap-px sm:gap-1 md:gap-1.5 mt-2">
            {VENTAS_POR_DIA.map((d, i) => {
              const ultimo = i === VENTAS_POR_DIA.length - 1;
              return (
                <div key={d.dia} className="flex-1 text-center min-w-[3px] sm:min-w-[8px]">
                  <span
                    className={`text-2xs dash-text-muted tabular-nums ${
                      i % 4 === 0 ? "" : "hidden sm:inline"
                    }`}
                  >
                    {i % PASO_ETIQUETAS === 0 || ultimo ? d.dia : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== PRODUCTOS MÁS VENDIDOS ===== */}
        <div className="dash-card rounded-2xl border-2 p-4">
          <h3 className="font-bold dash-text-primary text-sm mb-3">Productos más vendidos</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="pb-2 text-xs font-semibold dash-text-muted uppercase tracking-wide">
                  Producto
                </th>
                <th className="hidden sm:table-cell w-[35%] pb-2 text-xs font-semibold dash-text-muted uppercase tracking-wide">
                  Proporción
                </th>
                <th className="pb-2 text-right text-xs font-semibold dash-text-muted uppercase tracking-wide">
                  Unidades
                </th>
                <th className="pb-2 text-right text-xs font-semibold dash-text-muted uppercase tracking-wide">
                  Venta
                </th>
              </tr>
            </thead>
            <tbody>
              {TOP_PRODUCTOS.map((p, i) => (
                <tr key={p.nombre} className="border-t border-stone-800">
                  <td className="py-2.5 pr-3 dash-text-primary font-semibold">
                    <span className="dash-text-muted tabular-nums mr-2">{i + 1}.</span>
                    {p.nombre}
                  </td>
                  <td className="hidden sm:table-cell py-2.5 pr-3">
                    <div className="h-2 rounded-full bg-stone-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                        style={{ width: `${(p.unidades / UNIDADES_MAXIMAS) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2.5 text-right dash-text-primary tabular-nums font-bold whitespace-nowrap">
                    {p.unidades.toLocaleString("es-CL")}
                  </td>
                  <td className="py-2.5 text-right dash-text-secondary tabular-nums whitespace-nowrap">
                    {formatPrice(p.venta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
