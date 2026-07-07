"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { statusLabel, timeAgo, orderNumber } from "@/lib/utils";
import type { OrderStatus as OrderStatusType } from "@/types/database";

interface OrderStatusProps {
  orderId: string;
  localName: string;
  onNewOrder: () => void;
}

const STEPS: { key: OrderStatusType; label: string; icon: string; activeIcon: string }[] = [
  { key: "nuevo", label: "Pedido enviado", icon: "📤", activeIcon: "📤" },
  { key: "aceptado", label: "Aceptado por el local", icon: "✅", activeIcon: "✅" },
  { key: "preparando", label: "Preparando tu pedido", icon: "👨‍🍳", activeIcon: "🔥" },
  { key: "listo", label: "¡Listo para retirar!", icon: "🔔", activeIcon: "🎉" },
];

export default function OrderStatus({ orderId, localName, onNewOrder }: OrderStatusProps) {
  const [status, setStatus] = useState<OrderStatusType>("nuevo");
  const [orderNum, setOrderNum] = useState(0);
  const [createdAt, setCreatedAt] = useState("");

  useEffect(() => {
    supabase
      .from("pedidos").select("estado, numero_pedido, created_at")
      .eq("id", orderId).single()
      .then(({ data }) => {
        if (data) {
          setStatus(data.estado as OrderStatusType);
          setOrderNum(data.numero_pedido);
          setCreatedAt(data.created_at);
        }
      });

    const channel = supabase
      .channel(`order-${orderId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "pedidos", filter: `id=eq.${orderId}`,
      }, (payload) => {
        setStatus(payload.new.estado as OrderStatusType);
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === status);
  const isComplete = status === "listo" || status === "entregado";
  const progressPercent = isComplete ? 100 : (currentStepIndex / (STEPS.length - 1)) * 100;

  return (
    <div className="flex flex-col min-h-full items-center justify-center px-6 py-12" style={{
      background: "linear-gradient(180deg, #fff7ed 0%, #ffffff 40%, #fafaf9 100%)",
    }}>
      <div className="w-full max-w-sm animate-fade-in">
        {/* Header badge */}
        <div className="text-center mb-8">
          <div className={`w-24 h-24 mx-auto rounded-[28px] flex items-center justify-center text-5xl mb-6 shadow-xl transition-all duration-700 ${
            isComplete
              ? "bg-gradient-to-br from-green-400 to-emerald-500 shadow-green-200/50"
              : "bg-gradient-to-br from-orange-400 to-amber-500 shadow-orange-200/50"
          }`}>
            {isComplete ? "🎉" : "⏳"}
          </div>
          <h1 className="text-2xl font-black text-stone-900 leading-tight">
            {isComplete ? "¡Tu pedido está listo!" : "Pedido en proceso"}
          </h1>
          <p className="text-stone-400 mt-2 text-sm font-medium">{localName}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-600 text-xs font-bold">
              {orderNumber(orderNum)}
            </span>
            {createdAt && (
              <span className="text-stone-300 text-xs">{timeAgo(createdAt)}</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 mb-6">
          {/* Visual progress */}
          <div className="mb-6">
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progressPercent}%`,
                  background: isComplete
                    ? "linear-gradient(90deg, #22c55e, #10b981)"
                    : "linear-gradient(90deg, #f97316, #f59e0b)",
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
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg transition-all duration-500 ${
                      isDone
                        ? "bg-green-50 text-green-600 border border-green-100"
                        : isActive
                          ? "bg-orange-50 text-orange-600 border border-orange-200 ring-4 ring-orange-50 shadow-sm"
                          : "bg-stone-50 text-stone-300 border border-stone-100"
                    }`}>
                      {isDone ? "✓" : isActive ? step.activeIcon : step.icon}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`w-0.5 h-6 transition-all duration-500 my-1 rounded-full ${
                        isDone ? "bg-green-200" : "bg-stone-100"
                      }`} />
                    )}
                  </div>

                  <div className="pt-2.5">
                    <p className={`font-semibold text-[14px] transition-colors ${
                      isDone ? "text-green-600" : isActive ? "text-orange-600" : "text-stone-300"
                    }`}>
                      {step.label}
                    </p>
                    {isActive && !isComplete && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                        <p className="text-[11px] text-stone-400">{statusLabel(status)}...</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        {isComplete ? (
          <button
            onClick={onNewOrder}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-[15px] shadow-xl shadow-orange-200/40 hover:shadow-2xl active:scale-[0.98] transition-all animate-fade-in"
          >
            Hacer otro pedido 🍔
          </button>
        ) : (
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-stone-300">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <p className="text-[13px]">Actualizaciones en tiempo real</p>
            </div>
            <p className="text-[11px] text-stone-300">No cierres esta página</p>
          </div>
        )}
      </div>
    </div>
  );
}
