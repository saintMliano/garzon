"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useParams } from "next/navigation";
import type { CartItem, Producto } from "@/types/database";

const CART_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

/** Resumen de lo que cambió al reconciliar el carrito contra el menú vigente. */
export type CambiosCarrito = {
    actualizados: { nombre: string; precioAnterior: number; precioNuevo: number }[];
    removidos: string[]; // nombres de los productos que ya no están disponibles
};

interface CartContextType {
    items: CartItem[];
    addItem: (producto: Producto) => void;
    removeItem: (productoId: string) => void;
    updateQuantity: (productoId: string, cantidad: number) => void;
    updateNotes: (productoId: string, notas: string) => void;
    clearCart: () => void;
    reconciliar: (productosVigentes: Producto[]) => CambiosCarrito | null;
    total: number;
    itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * Función pura: compara el carrito contra el menú vigente y devuelve el carrito
 * resultante más el resumen de cambios. Vive fuera del componente para poder
 * aplicarse tanto al espejo síncrono (`itemsRef`) como al `prev` del updater.
 * Si nada cambió devuelve EL MISMO array por identidad, para que React haga
 * bailout del re-render y el efecto de persistencia no vuelva a escribir.
 */
function reconciliarItems(
    items: CartItem[],
    vigentes: Producto[]
): { items: CartItem[]; cambios: CambiosCarrito | null } {
    const porId = new Map(vigentes.map((p) => [p.id, p]));
    const actualizados: CambiosCarrito["actualizados"] = [];
    const removidos: string[] = [];
    const siguientes: CartItem[] = [];
    let mutado = false;

    for (const item of items) {
        const vigente = porId.get(item.producto.id);

        // Ya no está en el menú (agotado o eliminado): fuera del carrito.
        if (!vigente) {
            removidos.push(item.producto.nombre);
            mutado = true;
            continue;
        }

        const cambioPrecio = vigente.precio !== item.producto.precio;
        // Refresco silencioso de los campos que el carrito muestra.
        const cambioFicha =
            vigente.nombre !== item.producto.nombre ||
            vigente.descripcion !== item.producto.descripcion ||
            vigente.imagen_url !== item.producto.imagen_url;

        if (cambioPrecio) {
            actualizados.push({
                nombre: vigente.nombre,
                precioAnterior: item.producto.precio,
                precioNuevo: vigente.precio,
            });
        }

        if (cambioPrecio || cambioFicha) {
            // Se reemplaza el producto entero (no solo el precio) conservando
            // cantidad y notas del cliente.
            siguientes.push({ ...item, producto: vigente });
            mutado = true;
        } else {
            siguientes.push(item);
        }
    }

    if (!mutado) return { items, cambios: null };

    const hayAviso = actualizados.length > 0 || removidos.length > 0;
    return { items: siguientes, cambios: hayAviso ? { actualizados, removidos } : null };
}

export function CartProvider({ children }: { children: ReactNode }) {
    const { slug } = useParams<{ slug: string }>();
    const [items, setItems] = useState<CartItem[]>([]);
    const [hydrated, setHydrated] = useState(false);

    // Espejo síncrono de `items`. `reconciliar` tiene que DEVOLVER el diff en la
    // misma llamada, y el updater de `setItems` es diferido (React no garantiza
    // ejecutarlo en el acto), así que no sirve para producir el valor de retorno.
    // El ref se sincroniza en cada render y también al reconciliar, de modo que
    // dos llamadas seguidas en el mismo tick no reporten el cambio dos veces.
    const itemsRef = useRef<CartItem[]>(items);
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    // Hidratar el carrito desde localStorage al montar o cambiar de local
    useEffect(() => {
        setHydrated(false);
        if (typeof window === "undefined" || !slug) return;
        const key = `garzon:cart:${slug}`;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw) as { items: CartItem[]; ts: number };
                if (Date.now() - parsed.ts > CART_TTL_MS) {
                    localStorage.removeItem(key);
                    setItems([]);
                } else {
                    setItems(parsed.items ?? []);
                }
            } else {
                setItems([]);
            }
        } catch {
            localStorage.removeItem(key);
            setItems([]);
        } finally {
            setHydrated(true);
        }
    }, [slug]);

    // Persistir el carrito en localStorage
    useEffect(() => {
        if (typeof window === "undefined" || !slug || !hydrated) return;
        const key = `garzon:cart:${slug}`;
        localStorage.setItem(key, JSON.stringify({ items, ts: Date.now() }));
    }, [items, slug, hydrated]);

    const addItem = useCallback((producto: Producto) => {
        setItems((prev) => {
            const existing = prev.find((i) => i.producto.id === producto.id);
            if (existing) {
                return prev.map((i) =>
                    i.producto.id === producto.id
                        ? { ...i, cantidad: i.cantidad + 1 }
                        : i
                );
            }
            return [...prev, { producto, cantidad: 1, notas: "" }];
        });
    }, []);

    const removeItem = useCallback((productoId: string) => {
        setItems((prev) => prev.filter((i) => i.producto.id !== productoId));
    }, []);

    const updateQuantity = useCallback((productoId: string, cantidad: number) => {
        if (cantidad <= 0) {
            setItems((prev) => prev.filter((i) => i.producto.id !== productoId));
            return;
        }
        setItems((prev) =>
            prev.map((i) =>
                i.producto.id === productoId ? { ...i, cantidad } : i
            )
        );
    }, []);

    const updateNotes = useCallback((productoId: string, notas: string) => {
        setItems((prev) =>
            prev.map((i) =>
                i.producto.id === productoId ? { ...i, notas } : i
            )
        );
    }, []);

    const clearCart = useCallback(() => {
        setItems([]);
        if (typeof window !== "undefined" && slug) {
            localStorage.removeItem(`garzon:cart:${slug}`);
        }
    }, [slug]);

    const reconciliar = useCallback((productosVigentes: Producto[]) => {
        const base = itemsRef.current;
        const resultado = reconciliarItems(base, productosVigentes);

        // Sin cambios: no se toca el estado (ni re-render ni localStorage).
        if (resultado.items === base) return null;

        // El ref se adelanta al render para que una segunda llamada con los
        // mismos productos vigentes ya vea el carrito reconciliado → null.
        itemsRef.current = resultado.items;
        setItems((prev) =>
            // El estado se deriva siempre de `prev` (nunca de un closure viejo);
            // el camino rápido solo evita recalcular cuando el ref estaba al día.
            prev === base ? resultado.items : reconciliarItems(prev, productosVigentes).items
        );

        return resultado.cambios;
    }, []);

    const total = items.reduce(
        (sum, item) => sum + item.producto.precio * item.cantidad,
        0
    );

    const itemCount = items.reduce((sum, item) => sum + item.cantidad, 0);

    return (
        <CartContext.Provider
            value={{
                items,
                addItem,
                removeItem,
                updateQuantity,
                updateNotes,
                clearCart,
                reconciliar,
                total,
                itemCount,
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error("useCart must be used within CartProvider");
    }
    return context;
}
