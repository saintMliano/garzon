"use client";

import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/utils";

interface CartSheetProps {
  onClose: () => void;
  onCheckout: () => void;
}

export default function CartSheet({ onClose, onCheckout }: CartSheetProps) {
  const { items, updateQuantity, updateNotes, removeItem, total, itemCount } = useCart();

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col animate-slide-up shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-stone-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Tu Pedido</h2>
            <p className="text-xs text-stone-400">{itemCount} producto{itemCount !== 1 && "s"}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:bg-stone-200 hover:text-stone-600 transition-colors text-sm"
          >✕</button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-16 text-stone-300">
              <span className="text-5xl block mb-4">🛒</span>
              <p className="font-medium">Tu carrito está vacío</p>
              <p className="text-xs mt-1">Agrega productos desde el menú</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.producto.id}
                className="bg-stone-50/80 rounded-2xl p-4 border border-stone-100 hover:border-stone-200 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Product icon */}
                  <div className="w-11 h-11 rounded-xl bg-white border border-stone-100 flex items-center justify-center text-lg flex-shrink-0 shadow-sm">
                    🍽️
                  </div>

                  {/* Info + controls */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-stone-800 text-[14px] leading-tight">
                          {item.producto.nombre}
                        </h3>
                        <p className="text-[13px] text-orange-600 font-bold mt-1">
                          {formatPrice(item.producto.precio * item.cantidad)}
                          {item.cantidad > 1 && (
                            <span className="text-[11px] text-stone-400 font-normal ml-1">
                              ({formatPrice(item.producto.precio)} c/u)
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Quantity */}
                      <div className="flex items-center gap-1 bg-white rounded-xl border border-stone-200 p-0.5">
                        <button
                          onClick={() => updateQuantity(item.producto.id, item.cantidad - 1)}
                          className="w-7 h-7 rounded-lg hover:bg-stone-50 flex items-center justify-center text-stone-500 font-bold transition-colors text-sm"
                        >−</button>
                        <span className="w-6 text-center font-bold text-[13px] text-stone-800">{item.cantidad}</span>
                        <button
                          onClick={() => updateQuantity(item.producto.id, item.cantidad + 1)}
                          className="w-7 h-7 rounded-lg hover:bg-orange-50 flex items-center justify-center text-orange-600 font-bold transition-colors text-sm"
                        >+</button>
                      </div>
                    </div>

                    {/* Notes */}
                    <input
                      type="text"
                      placeholder="Ej: sin mayo, extra queso..."
                      value={item.notas}
                      onChange={(e) => updateNotes(item.producto.id, e.target.value)}
                      className="w-full mt-2.5 px-3 py-2 rounded-lg bg-white border border-stone-150 text-[12px] text-stone-700 placeholder:text-stone-300 focus:outline-none focus:ring-1 focus:ring-orange-200 focus:border-orange-300 transition-all"
                    />

                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.producto.id)}
                      className="mt-2 text-[11px] text-stone-400 hover:text-red-500 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-stone-100 px-5 py-4 safe-bottom">
            <div className="flex justify-between items-center mb-3">
              <span className="text-stone-500 text-sm font-medium">Total</span>
              <span className="text-2xl font-black text-stone-900">{formatPrice(total)}</span>
            </div>
            <button
              onClick={onCheckout}
              className="w-full h-[52px] rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-[15px] shadow-lg shadow-orange-200/50 hover:shadow-xl active:scale-[0.98] transition-all"
            >
              Confirmar Pedido →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
