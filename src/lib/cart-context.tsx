"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useParams } from "next/navigation";
import type { CartItem, Producto } from "@/types/database";

const CART_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

interface CartContextType {
    items: CartItem[];
    addItem: (producto: Producto) => void;
    removeItem: (productoId: string) => void;
    updateQuantity: (productoId: string, cantidad: number) => void;
    updateNotes: (productoId: string, notas: string) => void;
    clearCart: () => void;
    total: number;
    itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
    const { slug } = useParams<{ slug: string }>();
    const [items, setItems] = useState<CartItem[]>([]);
    const [hydrated, setHydrated] = useState(false);

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
