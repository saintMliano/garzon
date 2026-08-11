"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/utils";

interface CheckoutModalProps {
  localId: string;
  mesas?: string[];
  initialMesa?: string | null;
  onClose: () => void;
  onConfirmed: (orderId: string) => void;
}

const DEFAULT_MESA_OPTIONS = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Barra", "Para llevar"];

export default function CheckoutModal({ localId, mesas, initialMesa, onClose, onConfirmed }: CheckoutModalProps) {
  const { items, total, clearCart } = useCart();
  const mesaOptions = mesas && mesas.length > 0 ? mesas : DEFAULT_MESA_OPTIONS;
  const mesaBloqueada = !!initialMesa;
  const [nombre, setNombre] = useState("");
  const [mesa, setMesa] = useState(initialMesa || "");
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) { setError("Ingresa tu nombre"); return; }
    if (items.length === 0) return;

    setSubmitting(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc("crear_pedido", {
        p_local_id: localId,
        p_nombre: nombre.trim(),
        // Cadena vacía en vez de null: `crear_pedido` hace NULLIF(trim(...), '')
        // sobre estos argumentos, así que "" se guarda como NULL igual. Los tipos
        // generados por Supabase declaran los argumentos `text` como no-nulos —
        // Postgres no expone la nulabilidad de los parámetros de una función—, y
        // así se respeta el contrato generado sin castear ni cambiar la conducta.
        p_mesa: mesa.trim(),
        p_notas: notas.trim(),
        p_items: items.map((item) => ({
          producto_id: item.producto.id,
          cantidad: item.cantidad,
          notas: item.notas || null,
        })),
      });

      if (rpcError) throw new Error(rpcError.message || "No se pudo enviar el pedido, intenta de nuevo");

      clearCart();
      onConfirmed(data as string);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("no disponible")) {
        setError("Uno de los productos ya no está disponible. Vuelve al menú y revísalo.");
      } else if (message.includes("Cantidad inválida")) {
        setError(message);
      } else if (message.includes("Demasiados pedidos")) {
        setError("El local está recibiendo muchos pedidos; espera un minuto e intenta de nuevo.");
      } else {
        setError(message || "No se pudo enviar el pedido, intenta de nuevo");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !submitting && onClose()} />

      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md animate-slide-up shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-stone-200" />
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Header */}
          <div className="text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-2xl shadow-lg shadow-orange-200 mb-3">
              📋
            </div>
            <h2 className="text-xl font-bold text-stone-900">Confirmar Pedido</h2>
            <p className="text-sm text-stone-400 mt-1">
              {items.length} producto{items.length !== 1 && "s"} · {formatPrice(total)}
            </p>
          </div>

          {/* Order summary */}
          <div className="bg-stone-50 rounded-xl p-3 space-y-2 border border-stone-100">
            {items.map((item) => (
              <div key={item.producto.id} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">
                  <span className="font-medium text-stone-800">{item.cantidad}x</span> {item.producto.nombre}
                </span>
                <span className="text-stone-500 text-xs font-medium">{formatPrice(item.producto.precio * item.cantidad)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-stone-200 mt-2">
              <span className="font-bold text-stone-800 text-sm">Total</span>
              <span className="font-black" style={{ color: "var(--accent)" }}>{formatPrice(total)}</span>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1.5">Tu nombre *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Juan"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-400 transition-all text-[15px]"
            />
          </div>

          {/* Mesa quick select */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">¿Dónde estás?</label>
            {mesaBloqueada ? (
              <div className="flex flex-col items-start gap-1 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
                <span className="font-bold text-orange-700 text-sm">📍 {mesa}</span>
                <span className="text-[11px] text-orange-400">Detectada por el código QR</span>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {mesaOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setMesa(mesa === opt ? "" : opt)}
                    className={`py-2.5 rounded-xl text-[12px] font-semibold transition-all active:scale-95 ${
                      mesa === opt
                        ? "text-white shadow-sm shadow-orange-200"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                    style={mesa === opt ? { background: "var(--brand)" } : undefined}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1.5">Notas adicionales</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Indicaciones especiales..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-400 transition-all resize-none text-[14px]"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 py-2.5 px-3 rounded-xl border border-red-100">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 h-[50px] rounded-xl border-2 border-stone-200 font-semibold text-stone-500 hover:bg-stone-50 active:scale-[0.98] transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >Volver</button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-[2] h-[50px] rounded-xl text-white font-bold shadow-lg shadow-orange-200/50 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-[15px]"
              style={{ background: "var(--brand)" }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando...
                </span>
              ) : "Enviar Pedido 🚀"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
