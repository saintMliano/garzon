"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { statusLabel, timeAgo, orderNumber } from "@/lib/utils";
import type { OrderStatus as OrderStatusType } from "@/types/database";

// --- Paleta de marca del local ---------------------------------------------
// Los tintes se calculan con color-mix sobre `var(--brand)` en vez de aplicar
// opacidad: así el tinte no deja ver lo que haya debajo y sigue siendo un color
// sólido, sea cual sea la marca que eligió el dueño.

// Segundo tono del degradado: el diseño original jugaba con dos colores
// emparentados (naranja → ámbar); acá esos dos tonos salen de la marca y el
// acento del propio local.
const MARCA_TONO_2 = "color-mix(in srgb, var(--brand) 65%, var(--accent))";
// La marca puede ser clara (un amarillo, por ejemplo) y este color se usa como
// texto sobre fondo blanco: se oscurece lo justo para que se lea.
const MARCA_LEGIBLE = "color-mix(in srgb, var(--brand) 72%, black)";

interface OrderStatusProps {
  orderId: string;
  localName: string;
  onNewOrder: () => void;
  onDelivered?: () => void;
}

const STEPS: { key: OrderStatusType; label: string; icon: string; activeIcon: string }[] = [
  { key: "nuevo", label: "Pedido enviado", icon: "📤", activeIcon: "📤" },
  { key: "aceptado", label: "Aceptado por el local", icon: "✅", activeIcon: "✅" },
  { key: "preparando", label: "Preparando tu pedido", icon: "👨‍🍳", activeIcon: "🔥" },
  { key: "listo", label: "¡Listo para retirar!", icon: "🔔", activeIcon: "🎉" },
];

export default function OrderStatus({ orderId, localName, onNewOrder, onDelivered }: OrderStatusProps) {
  const [status, setStatus] = useState<OrderStatusType>("nuevo");
  const [orderNum, setOrderNum] = useState(0);
  const [createdAt, setCreatedAt] = useState("");
  // El ref se sincroniza en un efecto y no durante el render: escribirlo en el
  // cuerpo del componente es un efecto secundario en render, que con el
  // renderizado concurrente de React puede ejecutarse más de una vez o
  // descartarse. El sondeo lee `.current` recién cuando el pedido llega a
  // `entregado`, mucho después de que este efecto haya corrido.
  const onDeliveredRef = useRef(onDelivered);
  useEffect(() => {
    onDeliveredRef.current = onDelivered;
  }, [onDelivered]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let lastStatus: OrderStatusType | null = null;

    async function fetchStatus() {
      const { data } = await supabase.rpc("get_order_status", { p_order_id: orderId });
      const row = data?.[0];
      if (!row || cancelled) return;

      const newStatus = row.estado as OrderStatusType;
      setStatus(newStatus);
      setOrderNum(row.numero_pedido);
      setCreatedAt(row.created_at);

      if (lastStatus !== null && lastStatus !== newStatus && "vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      lastStatus = newStatus;

      if (newStatus === "entregado") {
        onDeliveredRef.current?.();
      }

      if (["entregado", "cancelado"].includes(newStatus) && intervalId) {
        clearInterval(intervalId);
      } else if (newStatus === "listo" && intervalId) {
        // El pedido ya está listo: bajar la frecuencia mientras se espera la entrega.
        clearInterval(intervalId);
        intervalId = setInterval(fetchStatus, 15000);
      }
    }

    fetchStatus();
    intervalId = setInterval(fetchStatus, 4000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [orderId]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === status);
  const isComplete = status === "listo" || status === "entregado";
  const isCancelled = status === "cancelado";
  const progressPercent = isComplete ? 100 : (currentStepIndex / (STEPS.length - 1)) * 100;

  // Solo el estado "en proceso" se pinta con la marca. "Listo" (verde) y
  // "cancelado" (rojo) son semánticos: significan lo mismo en todos los locales
  // y no pueden cambiar de color, o un local de marca roja haría que "listo" se
  // leyera como "cancelado".
  const enProcesoBadgeStyle: CSSProperties | undefined =
    isCancelled || isComplete
      ? undefined
      : {
          background: `linear-gradient(135deg, var(--brand), ${MARCA_TONO_2})`,
          boxShadow: `0 20px 25px -5px color-mix(in srgb, var(--brand) 30%, transparent)`,
        };

  const pasoActivoStyle: CSSProperties = {
    backgroundColor: "color-mix(in srgb, var(--brand) 10%, white)",
    borderColor: "color-mix(in srgb, var(--brand) 35%, white)",
    color: MARCA_LEGIBLE,
    // El halo reemplaza al `ring` de Tailwind para poder teñirlo con la marca.
    boxShadow: `0 0 0 4px color-mix(in srgb, var(--brand) 8%, white), 0 1px 2px 0 rgb(0 0 0 / 0.05)`,
  };

  return (
    <div className="flex flex-col min-h-full items-center justify-center px-6 py-12" style={{
      background: "linear-gradient(180deg, color-mix(in srgb, var(--brand) 8%, white) 0%, #ffffff 40%, #fafaf9 100%)",
    }}>
      <div className="w-full max-w-sm animate-fade-in">
        {/* Header badge */}
        <div className="text-center mb-8">
          <div
            className={`w-24 h-24 mx-auto rounded-[28px] flex items-center justify-center text-5xl mb-6 shadow-xl transition-all duration-700 ${
              isCancelled
                ? "bg-gradient-to-br from-red-300 to-red-400 shadow-red-100/50"
                : isComplete
                  ? "bg-gradient-to-br from-green-400 to-emerald-500 shadow-green-200/50"
                  : ""
            }`}
            style={enProcesoBadgeStyle}
          >
            {isCancelled ? "❌" : isComplete ? "🎉" : "⏳"}
          </div>
          <h1 className="text-2xl font-black text-stone-900 leading-tight">
            {isCancelled ? "Pedido cancelado" : isComplete ? "¡Tu pedido está listo!" : "Pedido en proceso"}
          </h1>
          <p className="text-stone-500 mt-2 text-sm font-medium">{localName}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-600 text-xs font-bold">
              {orderNumber(orderNum)}
            </span>
            {createdAt && (
              <span className="text-stone-400 text-xs">{timeAgo(createdAt)}</span>
            )}
          </div>
        </div>

        {isCancelled ? (
          /* Cancelled card */
          <div className="bg-red-50/60 rounded-3xl p-6 shadow-sm border border-red-100 mb-6 text-center">
            <p className="text-[14px] text-red-500 font-medium leading-relaxed">
              El local no pudo tomar tu pedido. Acércate a caja o consulta con el personal.
            </p>
          </div>
        ) : (
          /* Progress bar */
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 mb-6">
            {/* Visual progress */}
            <div className="mb-6">
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${progressPercent}%`,
                    // El verde de "completado" es semántico y no se tiñe con la marca.
                    background: isComplete
                      ? "linear-gradient(90deg, #22c55e, #10b981)"
                      : `linear-gradient(90deg, var(--brand), ${MARCA_TONO_2})`,
                  }}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-0">
              {STEPS.map((step, i) => {
                const isActive = i === currentStepIndex;
                const isDone = i < currentStepIndex || isComplete;

                return (
                  <div key={step.key} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg border transition-all duration-500 ${
                          isDone
                            ? "bg-green-50 text-green-600 border-green-100"
                            : isActive
                              ? ""
                              : "bg-stone-50 text-stone-400 border-stone-100"
                        }`}
                        style={isDone || !isActive ? undefined : pasoActivoStyle}
                      >
                        {isDone ? "✓" : isActive ? step.activeIcon : step.icon}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`w-0.5 h-6 transition-all duration-500 my-1 rounded-full ${
                          isDone ? "bg-green-200" : "bg-stone-100"
                        }`} />
                      )}
                    </div>

                    <div className="pt-2.5">
                      <p
                        className={`font-semibold text-[14px] transition-colors ${
                          isDone ? "text-green-600" : isActive ? "" : "text-stone-400"
                        }`}
                        style={isDone || !isActive ? undefined : { color: MARCA_LEGIBLE }}
                      >
                        {step.label}
                      </p>
                      {isActive && !isComplete && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div
                            className="w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ backgroundColor: "var(--brand)" }}
                          />
                          <p className="text-[11px] text-stone-500">{statusLabel(status)}...</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA */}
        {isCancelled ? (
          <button
            onClick={onNewOrder}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-stone-600 to-stone-700 text-white font-bold text-[15px] shadow-xl shadow-stone-200/40 hover:shadow-2xl active:scale-[0.98] transition-all animate-fade-in"
          >
            Hacer otro pedido 🍔
          </button>
        ) : isComplete ? (
          <button
            onClick={onNewOrder}
            className="w-full h-14 rounded-2xl font-bold text-[15px] hover:shadow-2xl active:scale-[0.98] transition-all animate-fade-in"
            style={{
              background: `linear-gradient(90deg, var(--brand), ${MARCA_TONO_2})`,
              // `--brand-texto` ya viene calculado para leerse sobre la marca:
              // un blanco fijo desaparecería si el local eligió un color claro.
              color: "var(--brand-texto)",
              boxShadow: `0 20px 25px -5px color-mix(in srgb, var(--brand) 25%, transparent)`,
            }}
          >
            Hacer otro pedido 🍔
          </button>
        ) : (
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-stone-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <p className="text-[13px]">Actualizaciones en tiempo real</p>
            </div>
            <p className="text-[11px] text-stone-400">No cierres esta página</p>
          </div>
        )}
      </div>
    </div>
  );
}
