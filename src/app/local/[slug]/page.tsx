"use client";

import type React from "react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/lib/cart-context";
import { formatPrice, normalizar } from "@/lib/utils";
import type { Local, Categoria, Producto } from "@/types/database";
import CartSheet from "./cart-sheet";
import CheckoutModal from "./checkout-modal";
import OrderStatus from "./order-status";

export default function LocalPage() {
  const { slug } = useParams<{ slug: string }>();
  const [local, setLocal] = useState<Local | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [flashedId, setFlashedId] = useState<string | null>(null);
  const [mesaFromQR, setMesaFromQR] = useState<string | null>(null);
  const categoryRefs = useRef<Map<string, HTMLElement>>(new Map());

  const { addItem, itemCount, total, items, updateQuantity } = useCart();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data: localData, error: localError } = await supabase
        .from("locales").select("*").eq("slug", slug).single();
      // PGRST116 = "no rows returned" -> el local simplemente no existe, no es un error de red/consulta
      if (localError && localError.code !== "PGRST116") throw localError;
      if (!localData) {
        setLocal(null);
        return;
      }
      setLocal(localData);

      const { data: cats, error: catsError } = await supabase
        .from("categorias").select("*").eq("local_id", localData.id).order("orden");
      if (catsError) throw catsError;
      const { data: prods, error: prodsError } = await supabase
        .from("productos").select("*").eq("local_id", localData.id).eq("disponible", true).order("orden");
      if (prodsError) throw prodsError;

      setCategorias(cats ?? []);
      setProductos(prods ?? []);
      if (cats && cats.length > 0) setActiveCategory(cats[0].id);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // Leer la mesa desde el QR (?mesa=...) sin useSearchParams para evitar un Suspense boundary
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mesa = new URLSearchParams(window.location.search).get("mesa");
    setMesaFromQR(mesa);
  }, []);

  // Restaurar el pedido activo (si lo hay) al montar o cambiar de local
  useEffect(() => {
    if (typeof window === "undefined" || !slug) return;
    const key = `garzon:order:${slug}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id: string; ts: number };
      if (Date.now() - parsed.ts > 3 * 60 * 60 * 1000) {
        localStorage.removeItem(key);
        return;
      }
      setConfirmedOrderId(parsed.id);
    } catch {
      localStorage.removeItem(key);
    }
  }, [slug]);

  function scrollToCategory(catId: string) {
    setActiveCategory(catId);
    categoryRefs.current.get(catId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const handleAdd = useCallback((prod: Producto) => {
    addItem(prod);
    setFlashedId(prod.id);
    setTimeout(() => setFlashedId(null), 600);
  }, [addItem]);

  const getItemQty = useCallback(
    (prodId: string) => items.find((i) => i.producto.id === prodId)?.cantidad ?? 0,
    [items]
  );

  // Filter products by search
  const filteredProducts = search.trim()
    ? productos.filter((p) =>
        normalizar(p.nombre).includes(normalizar(search)) ||
        normalizar(p.descripcion ?? "").includes(normalizar(search))
      )
    : null;

  if (confirmedOrderId) {
    return (
      <OrderStatus
        orderId={confirmedOrderId}
        localName={local?.nombre ?? ""}
        onNewOrder={() => {
          setConfirmedOrderId(null);
          if (typeof window !== "undefined") localStorage.removeItem(`garzon:order:${slug}`);
        }}
        onDelivered={() => {
          setConfirmedOrderId(null);
          if (typeof window !== "undefined") localStorage.removeItem(`garzon:order:${slug}`);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-4 border-orange-100 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
          </div>
          <p className="text-stone-400 text-sm font-medium">Cargando menú...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center min-h-screen">
        <div className="animate-fade-in">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-red-50 flex items-center justify-center text-4xl mb-5">⚠️</div>
          <h2 className="text-xl font-bold text-stone-800">No se pudo cargar el menú</h2>
          <p className="text-stone-500 mt-2 text-sm">Revisa tu conexión e intenta nuevamente.</p>
          <button
            onClick={() => load()}
            className="mt-5 h-11 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm active:scale-95 transition-all"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!local) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center min-h-screen">
        <div className="animate-fade-in">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-stone-100 flex items-center justify-center text-4xl mb-5">🔍</div>
          <h2 className="text-xl font-bold text-stone-800">Local no encontrado</h2>
          <p className="text-stone-500 mt-2 text-sm">Verifica el link o escanea el QR nuevamente.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col min-h-full bg-stone-50"
      style={{ ["--brand" as string]: local.color_primario, ["--accent" as string]: local.color_acento } as React.CSSProperties}
    >
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-30 glass border-b border-stone-200/50">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            {/* Local branding */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-white/60 overflow-hidden"
              style={{ background: `${local.color_primario}18` }}
            >
              {local.logo_url ? (
                <Image
                  src={local.logo_url}
                  alt={local.nombre}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                "🍔"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-extrabold text-stone-900 text-[17px] leading-tight truncate">
                {local.nombre}
              </h1>
              <p className="text-[11px] text-stone-400 truncate flex items-center gap-1">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {local.direccion}
              </p>
              {local.slogan && (
                <p className="text-[11px] text-stone-400 truncate">{local.slogan}</p>
              )}
            </div>
            {/* Cart icon in header */}
            {itemCount > 0 && (
              <button
                onClick={() => setShowCart(true)}
                className="relative w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-md shadow-orange-200 active:scale-90 transition-transform"
                style={{ background: "var(--brand)" }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m1.6 8l-1.35-6.73M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-orange-600 text-[10px] font-black rounded-full flex items-center justify-center shadow-sm animate-pop">
                  {itemCount}
                </span>
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="mt-3 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en el menú..."
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-stone-100/80 border border-stone-200/60 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-xs"
              >✕</button>
            )}
          </div>
        </div>

        {/* Category pills — hidden during search */}
        {!search && (
          <div className="overflow-x-auto scrollbar-hide px-4 pb-3">
            <div className="flex gap-2 max-w-lg mx-auto">
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-200 ${
                    activeCategory === cat.id
                      ? ""
                      : "bg-white text-stone-600 border border-stone-200/80 hover:border-orange-200 hover:text-orange-600"
                  }`}
                  style={
                    activeCategory === cat.id
                      ? { background: "var(--brand)", color: "white", borderColor: "transparent" }
                      : undefined
                  }
                >
                  {cat.icono} {cat.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ===== PRODUCT LIST ===== */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 pt-4 pb-28">
        {/* Search results */}
        {filteredProducts ? (
          <section>
            <p className="text-xs text-stone-400 mb-3 font-medium">
              {filteredProducts.length} resultado{filteredProducts.length !== 1 && "s"} para &quot;{search}&quot;
            </p>
            <div className="grid gap-3">
              {filteredProducts.map((prod, i) => (
                <ProductCard
                  key={prod.id}
                  prod={prod}
                  icon={categorias.find(c => c.id === prod.categoria_id)?.icono ?? "🍽️"}
                  qty={getItemQty(prod.id)}
                  flashed={flashedId === prod.id}
                  onAdd={() => handleAdd(prod)}
                  onUpdateQty={(q) => updateQuantity(prod.id, q)}
                  delay={i * 40}
                />
              ))}
              {filteredProducts.length === 0 && (
                <div className="text-center py-16 text-stone-300">
                  <span className="text-4xl block mb-3">🔍</span>
                  <p className="text-sm">No encontramos ese producto</p>
                </div>
              )}
            </div>
          </section>
        ) : (
          /* Category sections */
          categorias.map((cat) => {
            const catProducts = productos.filter((p) => p.categoria_id === cat.id);
            if (catProducts.length === 0) return null;

            return (
              <section
                key={cat.id}
                ref={(el) => { if (el) categoryRefs.current.set(cat.id, el); }}
                className="mb-8 scroll-mt-40"
              >
                <h2 className="text-[15px] font-extrabold text-stone-800 mb-3 flex items-center gap-2">
                  <span className="text-lg">{cat.icono}</span> {cat.nombre}
                </h2>
                <div className="grid gap-2.5">
                  {catProducts.map((prod, i) => (
                    <ProductCard
                      key={prod.id}
                      prod={prod}
                      icon={cat.icono ?? "🍽️"}
                      qty={getItemQty(prod.id)}
                      flashed={flashedId === prod.id}
                      onAdd={() => handleAdd(prod)}
                      onUpdateQty={(q) => updateQuantity(prod.id, q)}
                      delay={i * 50}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* ===== FLOATING CART BAR ===== */}
      {itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 safe-bottom animate-slide-up">
          <button
            onClick={() => setShowCart(true)}
            className="w-full max-w-lg mx-auto flex items-center justify-between h-[58px] px-5 rounded-2xl text-white font-semibold shadow-xl shadow-orange-300/30 hover:shadow-2xl active:scale-[0.98] transition-all"
            style={{ background: "var(--brand)" }}
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm font-black">
                {itemCount}
              </span>
              <span className="text-[15px]">Ver pedido</span>
            </div>
            <span className="text-[17px] font-bold">{formatPrice(total)}</span>
          </button>
        </div>
      )}

      {/* Modals */}
      {showCart && (
        <CartSheet onClose={() => setShowCart(false)} onCheckout={() => { setShowCart(false); setShowCheckout(true); }} />
      )}
      {showCheckout && local && (
        <CheckoutModal
          localId={local.id}
          mesas={local.mesas ?? undefined}
          initialMesa={mesaFromQR}
          onClose={() => setShowCheckout(false)}
          onConfirmed={(orderId) => {
            setShowCheckout(false);
            setConfirmedOrderId(orderId);
            if (typeof window !== "undefined") {
              localStorage.setItem(`garzon:order:${slug}`, JSON.stringify({ id: orderId, ts: Date.now() }));
            }
          }}
        />
      )}
    </div>
  );
}

/* ===== PRODUCT CARD COMPONENT ===== */
function ProductCard({
  prod, icon, qty, flashed, onAdd, onUpdateQty, delay,
}: {
  prod: Producto; icon: string; qty: number; flashed: boolean;
  onAdd: () => void; onUpdateQty: (q: number) => void; delay: number;
}) {
  const inCart = qty > 0;
  const imgSrc = prod.imagen_url;

  return (
    <div
      className={`stagger-card flex items-center gap-3 bg-white rounded-2xl p-3 border transition-all group ${
        inCart
          ? "border-orange-200/80 shadow-sm shadow-orange-100/50"
          : "border-stone-100 shadow-sm hover:shadow-md hover:border-stone-200"
      } ${flashed ? "flash-added" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Product thumbnail */}
      {imgSrc ? (
        <div className="w-[60px] h-[60px] rounded-xl overflow-hidden flex-shrink-0 transition-transform group-hover:scale-105 bg-stone-50">
          <Image
            src={imgSrc}
            alt={prod.nombre}
            width={60}
            height={60}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className={`w-[60px] h-[60px] rounded-xl flex items-center justify-center text-[26px] flex-shrink-0 transition-transform group-hover:scale-105 ${
          inCart ? "bg-orange-50" : "bg-gradient-to-br from-stone-50 to-stone-100/80"
        }`}>
          {icon}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <h3 className="font-semibold text-stone-800 text-[14px] leading-tight">{prod.nombre}</h3>
        {prod.descripcion && (
          <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1 leading-snug">{prod.descripcion}</p>
        )}
        <p className="text-[14px] font-bold mt-1" style={{ color: "var(--accent)" }}>{formatPrice(prod.precio)}</p>
      </div>

      {/* Add / Qty control */}
      {inCart ? (
        <div className="flex items-center gap-1 bg-orange-50 rounded-xl p-1 border border-orange-100 animate-fade-in-fast">
          <button
            onClick={() => onUpdateQty(qty - 1)}
            className="w-8 h-8 rounded-lg bg-white hover:bg-orange-100 flex items-center justify-center text-orange-600 font-bold transition-colors text-sm shadow-sm"
          >−</button>
          <span className="w-7 text-center font-bold text-sm text-orange-700">{qty}</span>
          <button
            onClick={() => onUpdateQty(qty + 1)}
            className="w-8 h-8 rounded-lg bg-orange-500 hover:bg-orange-600 flex items-center justify-center text-white font-bold transition-colors text-sm shadow-sm"
          >+</button>
        </div>
      ) : (
        <button
          onClick={onAdd}
          className="w-10 h-10 rounded-xl active:scale-90 text-white flex items-center justify-center transition-all shadow-sm shadow-orange-200/60"
          style={{ background: "var(--brand)" }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}

