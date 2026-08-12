"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/utils";

interface CheckoutModalProps {
  localId: string;
  slug: string;
  mesas?: string[];
  initialMesa?: string | null;
  onClose: () => void;
  onConfirmed: (orderId: string) => void;
}

const DEFAULT_MESA_OPTIONS = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Barra", "Para llevar"];

/** Mismo criterio que el carrito: un intento de checkout caduca a las 2 horas. */
const CHECKOUT_TTL_MS = 2 * 60 * 60 * 1000;

const MENSAJE_GENERICO =
  "No se pudo confirmar el envío. Puedes intentar de nuevo: si el pedido ya entró, no se duplicará.";

/**
 * `crypto.randomUUID` no existe en contextos no seguros (http en la LAN del
 * local, por ejemplo). El id solo tiene que ser único, no criptográfico.
 */
function nuevoUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
  const variante = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variante}${hex(3)}-${hex(12)}`;
}

export default function CheckoutModal({ localId, slug, mesas, initialMesa, onClose, onConfirmed }: CheckoutModalProps) {
  const { items, total, clearCart } = useCart();
  const mesaOptions = mesas && mesas.length > 0 ? mesas : DEFAULT_MESA_OPTIONS;
  const mesaBloqueada = !!initialMesa;
  const [nombre, setNombre] = useState("");
  const [mesa, setMesa] = useState(initialMesa || "");
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Id de idempotencia del intento de checkout en curso: viaja igual en todos
  // los reintentos, así `crear_pedido` devuelve el pedido ya creado en vez de
  // uno nuevo. Se genera perezosamente porque `crypto` no existe durante el
  // render en el servidor.
  const checkoutIdRef = useRef("");
  const storageKey = `garzon:checkout:${slug}`;

  function obtenerCheckoutId(): string {
    if (checkoutIdRef.current) return checkoutIdRef.current;

    // El caso real: el cliente toca "Enviar", se queda sin señal y recarga la
    // página. El reintento tiene que llevar el MISMO id que el envío perdido.
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const guardado = JSON.parse(raw) as { id?: unknown; ts?: unknown };
        const vigente = typeof guardado.ts === "number" && Date.now() - guardado.ts <= CHECKOUT_TTL_MS;
        if (typeof guardado.id === "string" && guardado.id && vigente) {
          checkoutIdRef.current = guardado.id;
          return guardado.id;
        }
        localStorage.removeItem(storageKey);
      }
    } catch {
      // localStorage inaccesible o entrada corrupta: se sigue sin idempotencia
      // entre recargas, pero sí dentro de esta sesión del modal.
    }

    const id = nuevoUuid();
    checkoutIdRef.current = id;
    try {
      // Se persiste ANTES de llamar a la RPC: si la respuesta se pierde, el id
      // ya sobrevivió a la recarga.
      localStorage.setItem(storageKey, JSON.stringify({ id, ts: Date.now() }));
    } catch {
      // Sin almacenamiento el id vive solo en memoria; el checkout sigue igual.
    }
    return id;
  }

  /** El pedido entró: el próximo checkout tiene que arrancar con un id nuevo. */
  function olvidarCheckoutId() {
    checkoutIdRef.current = "";
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Nada que limpiar si el almacenamiento no está disponible.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) { setError("Ingresa tu nombre"); return; }
    if (items.length === 0) return;

    setSubmitting(true);
    setError("");

    const clientRequestId = obtenerCheckoutId();

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
        p_client_request_id: clientRequestId,
      });

      if (rpcError) throw new Error(rpcError.message || "");

      olvidarCheckoutId();
      clearCart();
      onConfirmed(data as string);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // "Local no disponible" va ANTES que la de producto: ambas contienen "no
      // disponible" y acá reintentar no sirve de nada — el local cerró.
      if (message.includes("Local no disponible")) {
        setError("Este local dejó de recibir pedidos por ahora. Consulta con el personal.");
      } else if (message.includes("no disponible")) {
        setError("Uno de los productos ya no está disponible. Vuelve al menú y revísalo.");
      } else if (message.includes("excede el monto máximo")) {
        setError("El pedido es demasiado grande para enviarlo de una vez. Divídelo en dos.");
      } else if (message.includes("Cantidad inválida")) {
        setError(message);
      } else if (message.includes("Demasiados pedidos")) {
        setError("El local está recibiendo muchos pedidos; espera un minuto e intenta de nuevo.");
      } else {
        // Incluye la respuesta perdida en la red ("Failed to fetch"): el pedido
        // pudo haber entrado igual, y el reintento no lo va a duplicar.
        setError(MENSAJE_GENERICO);
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
            <div
              className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-2xl shadow-lg mb-3"
              style={{ background: "linear-gradient(135deg, var(--brand), var(--accent))" }}
            >
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
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-[var(--brand)] transition-all text-[15px]"
            />
          </div>

          {/* Mesa quick select */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">¿Dónde estás?</label>
            {mesaBloqueada ? (
              <div
                className="flex flex-col items-start gap-1 border rounded-xl px-4 py-3"
                style={{
                  background: "color-mix(in srgb, var(--brand) 10%, white)",
                  borderColor: "color-mix(in srgb, var(--brand) 25%, white)",
                }}
              >
                <span className="font-bold text-sm" style={{ color: "var(--accent-legible)" }}>📍 {mesa}</span>
                <span className="text-[11px] text-stone-400">Detectada por el código QR</span>
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
                        ? "shadow-sm"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                    style={mesa === opt ? { background: "var(--brand)", color: "var(--brand-texto)" } : undefined}
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
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-[var(--brand)] transition-all resize-none text-[14px]"
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
              className="flex-[2] h-[50px] rounded-xl font-bold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-[15px]"
              style={{ background: "var(--brand)", color: "var(--brand-texto)" }}
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
