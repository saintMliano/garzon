"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/utils";

interface CheckoutModalProps {
  localId: string;
  onClose: () => void;
  onConfirmed: (orderId: string) => void;
}

const MESA_OPTIONS = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Barra", "Para llevar"];

export default function CheckoutModal({ localId, onClose, onConfirmed }: CheckoutModalProps) {
  const { items, total, clearCart } = useCart();
  const [nombre, setNombre] = useState("");
  const [mesa, setMesa] = useState("");
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
      const { data: pedido, error: pedidoError } = await supabase
        .from("pedidos")
        .insert({
          local_id: localId,
          estado: "nuevo",
          nombre_cliente: nombre.trim(),
          mesa: mesa.trim() || null,
          total,
          notas: notas.trim() || null,
        })
        .select()
        .single();

      if (pedidoError || !pedido) throw new Error(pedidoError?.message ?? "Error creando pedido");

      const itemsToInsert = items.map((item) => ({
        pedido_id: pedido.id,
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        precio_unitario: item.producto.precio,
        notas: item.notas || null,
      }));

      const { error: itemsError } = await supabase.from("pedido_items").insert(itemsToInsert);
      if (itemsError) throw new Error(itemsError.message);

      clearCart();
      onConfirmed(pedido.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar pedido");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

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
              <span className="font-black text-orange-600">{formatPrice(total)}</span>
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
            <div className="grid grid-cols-4 gap-2">
              {MESA_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setMesa(mesa === opt ? "" : opt)}
                  className={`py-2.5 rounded-xl text-[12px] font-semibold transition-all active:scale-95 ${
                    mesa === opt
                      ? "bg-orange-500 text-white shadow-sm shadow-orange-200"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
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
              className="flex-1 h-[50px] rounded-xl border-2 border-stone-200 font-semibold text-stone-500 hover:bg-stone-50 active:scale-[0.98] transition-all text-sm"
            >Volver</button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-[2] h-[50px] rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold shadow-lg shadow-orange-200/50 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-[15px]"
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
