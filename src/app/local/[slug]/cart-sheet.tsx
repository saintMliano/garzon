"use client";

import { ShoppingCartIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Modal from "@/componentes/modal";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/utils";
import { NOTAS_RAPIDAS, agregarNotaRapida } from "@/lib/notas-rapidas";

interface CartSheetProps {
  onClose: () => void;
  onCheckout: () => void;
}

export default function CartSheet({ onClose, onCheckout }: CartSheetProps) {
  const { items, updateQuantity, updateNotes, removeItem, total, itemCount } = useCart();

  return (
    <Modal
      titulo="Tu pedido"
      onClose={onClose}
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
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
            {/* Este contador cambia sin que nadie toque el header: lo mueven
                los +/- y el "Eliminar" de la lista de abajo. El total del pie
                sale del mismo toque, y marcarlo también haría que cada "+" se
                leyera dos veces; con uno alcanza. */}
            <p className="text-xs text-stone-500" aria-live="polite">{itemCount} producto{itemCount !== 1 && "s"}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar el pedido"
            className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 hover:text-stone-600 transition-colors text-sm"
          >
            <XMarkIcon aria-hidden className="w-5 h-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <ShoppingCartIcon aria-hidden className="w-12 h-12 mx-auto mb-4" />
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
                  {/* Este 🍽️ NO es chrome y por eso sobrevivió al barrido de
                      iconos: es el mismo marcador de "producto sin foto" que usa
                      `ProductCard`, donde sale de `cat.icono` —lo que eligió el
                      dueño— con este emoji de reserva. Cambiarlo por un icono
                      acá dejaría la misma línea con dos dibujos distintos entre
                      la carta y el carrito. Cuando el carrito conozca la
                      categoría del ítem, esto pasa a ser `cat.icono`. */}
                  <div className="w-11 h-11 rounded-xl bg-white border border-stone-100 flex items-center justify-center text-lg shrink-0 shadow-sm">
                    🍽️
                  </div>

                  {/* Info + controls */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-stone-800 text-sm leading-tight">
                          {item.producto.nombre}
                        </h3>
                        <p className="text-sm font-bold mt-1" style={{ color: "var(--accent)" }}>
                          {formatPrice(item.producto.precio * item.cantidad)}
                          {item.cantidad > 1 && (
                            <span className="text-xs text-stone-500 font-normal ml-1">
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
                        <span className="w-6 text-center font-bold text-sm text-stone-800">{item.cantidad}</span>
                        <button
                          onClick={() => updateQuantity(item.producto.id, item.cantidad + 1)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center font-bold transition-colors text-sm"
                          style={{ color: "var(--accent-legible)" }}
                        >+</button>
                      </div>
                    </div>

                    {/* Notes */}
                    {/* Va en `text-base` aunque la línea del producto sea más
                        chica: con menos de 16px iOS hace zoom al enfocar y saca
                        de cuadro el carrito entero. */}
                    <input
                      type="text"
                      // El `placeholder` no es un nombre accesible: desaparece al
                      // escribir, así que con cinco líneas en el carrito un lector
                      // de pantalla anunciaba cinco campos idénticos sin decir de
                      // cuál producto era la nota.
                      aria-label={`Nota para ${item.producto.nombre}`}
                      placeholder="Ej: sin mayo, extra queso..."
                      value={item.notas}
                      onChange={(e) => updateNotes(item.producto.id, e.target.value)}
                      className="w-full mt-2.5 px-3 py-2 rounded-lg bg-white border border-stone-150 text-base text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)] transition-all"
                    />

                    {/* Atajos: los mismos que usa el garzón en su comanda.
                        Escribir en el teléfono es lento y la mayoría de los
                        cambios son estos seis. Van en gris y no en el color del
                        local: son ayudas, no llamadas a la acción, y no deben
                        competir con el botón de confirmar el pedido. */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {NOTAS_RAPIDAS.map((atajo) => (
                        <button
                          key={atajo}
                          type="button"
                          onClick={() =>
                            updateNotes(item.producto.id, agregarNotaRapida(item.notas, atajo))
                          }
                          className="px-2 py-1 rounded-lg bg-white border border-stone-200 text-xs font-medium text-stone-500 hover:text-stone-800 hover:border-stone-300 active:scale-95 transition-all"
                        >
                          {atajo}
                        </button>
                      ))}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.producto.id)}
                      className="mt-2 text-xs text-stone-500 hover:text-red-500 transition-colors flex items-center gap-1"
                    >
                      <TrashIcon aria-hidden className="w-3.5 h-3.5" />
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
              <span className="text-2xl font-black" style={{ color: "var(--accent)" }}>{formatPrice(total)}</span>
            </div>
            <button
              onClick={onCheckout}
              className="w-full h-[52px] rounded-2xl font-bold text-base shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
              style={{ background: "var(--brand)", color: "var(--brand-texto)" }}
            >
              Confirmar Pedido →
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
