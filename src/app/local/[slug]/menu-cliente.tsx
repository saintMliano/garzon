"use client";

import type React from "react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  BuildingStorefrontIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  MegaphoneIcon,
  PlusIcon,
  ShoppingCartIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCart, type CambiosCarrito } from "@/lib/cart-context";
import { formatPrice, normalizar } from "@/lib/utils";
import type { LocalPublico, Categoria, Producto } from "@/types/database";
import CartSheet from "./cart-sheet";
import CheckoutModal from "./checkout-modal";
import OrderStatus from "./order-status";

/**
 * Artículos que no distinguen nada: "El Lalo" y "El Rincón" darían los dos una
 * "E". La inicial útil es la de la primera palabra que sí nombra al local.
 */
const ARTICULOS = new Set(["el", "la", "los", "las", "le", "the"]);

/**
 * ¿Sirve este carácter como inicial? Vale si tiene mayúscula y minúscula
 * distintas —o sea, si es una letra en cualquier alfabeto con caja— o si es un
 * dígito ("3 Monos"). Deja afuera comillas, emoji y signos, que dibujados
 * grandes dentro del cuadrito no dicen nada.
 */
function sirveDeInicial(c: string): boolean {
  return c.toLocaleLowerCase("es") !== c.toLocaleUpperCase("es") || /[0-9]/.test(c);
}

/**
 * Inicial para el marcador de los locales que todavía no subieron logo.
 *
 * Va NFC antes de cortar porque el nombre puede venir guardado descompuesto ("A"
 * + tilde suelta) y partirlo por índice dejaría la tilde huérfana. Recorre
 * palabra por palabra y carácter por carácter en vez de tomar el primero y
 * listo: "El Lalo" tiene que dar "L" y no una "E" que no distingue nada, y
 * "🍔 Burger" tiene que dar "B" en lugar de rendirse en el emoji.
 *
 * Si nada sirve devuelve "" y la pantalla cae al icono de local, que es mejor
 * que un cuadrito con un tofu adentro.
 */
function inicialDe(nombre: string): string {
  const palabras = nombre.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  // Las palabras sin artículo primero, y todas después como red de contención:
  // un local que se llama solo "El" igual tiene que mostrar algo.
  const orden = [...palabras.filter((p) => !ARTICULOS.has(normalizar(p))), ...palabras];
  for (const palabra of orden) {
    for (const c of palabra) {
      if (sirveDeInicial(c)) return c.toLocaleUpperCase("es");
    }
  }
  return "";
}

/**
 * Parte interactiva del menú. Los datos llegan por props desde el Server
 * Component: el celular del comensal ya no gasta dos oleadas de consultas antes
 * de poder ver la carta.
 */
export default function MenuCliente({
  slug,
  local,
  categorias,
  productos,
  mesaDelQR,
}: {
  slug: string;
  local: LocalPublico;
  categorias: Categoria[];
  productos: Producto[];
  mesaDelQR: string | null;
}) {
  const router = useRouter();

  // Suscripción pausada (F10): la carta se sigue viendo —es la vitrina del
  // local— pero no se puede pedir. Esto solo ordena la pantalla; el corte de
  // verdad lo hace `crear_pedido` en el servidor.
  const pedidosHabilitados = local.pedidos_habilitados;
  const inicial = inicialDe(local.nombre);
  const [activeCategory, setActiveCategory] = useState<string | null>(categorias[0]?.id ?? null);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [flashedId, setFlashedId] = useState<string | null>(null);
  const [cambiosCarrito, setCambiosCarrito] = useState<CambiosCarrito | null>(null);
  const categoryRefs = useRef<Map<string, HTMLElement>>(new Map());
  const pillRefs = useRef<Map<string, HTMLElement>>(new Map());
  const pillContainerRef = useRef<HTMLDivElement>(null);
  const isManualScrolling = useRef(false);

  const { addItem, itemCount, total, items, updateQuantity, reconciliar } = useCart();

  // Refresca los datos del servidor cuando el comensal vuelve a la pestaña.
  // El menú puede llevar media hora abierto sobre la mesa: sin esto, un precio
  // cambiado o un "se acabó la palta" nunca llegarían a esta pantalla.
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, [router]);

  // Reconcilia el carrito guardado contra los productos vigentes: actualiza los
  // precios que cambiaron y saca lo que ya no está. Sin esto, el cliente veía un
  // total y el servidor le cobraba otro (el total real lo calcula Postgres), o
  // el pedido fallaba diciendo "producto no disponible" sin decir cuál.
  //
  // `reconciliar` es idempotente: si no hay nada que ajustar devuelve null y no
  // toca el estado, así que puede correr en cada cambio de `items` (incluida la
  // hidratación desde localStorage, que llega después del primer render).
  useEffect(() => {
    if (productos.length === 0) return; // nunca vaciar el carrito por una carga vacía
    // El carrito vive en localStorage y solo se conoce después de montar, así que
    // ajustarlo es forzosamente un efecto. `reconciliar` es idempotente y devuelve
    // null cuando no hay nada que cambiar, así que la cascada se corta sola en la
    // segunda vuelta.
    /* eslint-disable react-hooks/set-state-in-effect */
    const cambios = reconciliar(productos);
    if (cambios) setCambiosCarrito(cambios);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [productos, items, reconciliar]);

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
      // localStorage no existe en el servidor: este estado solo puede
      // inicializarse después del montaje. Es un render extra, una vez.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirmedOrderId(parsed.id);
    } catch {
      localStorage.removeItem(key);
    }
  }, [slug]);

  const scrollToCategory = useCallback((catId: string) => {
    setActiveCategory(catId);
    isManualScrolling.current = true;
    categoryRefs.current.get(catId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      isManualScrolling.current = false;
    }, 800);
  }, []);

  // Sync scroll position with active category pill
  useEffect(() => {
    if (search || categorias.length === 0) return;

    let rafId: number;

    const handleScroll = () => {
      if (isManualScrolling.current) return;

      const headerOffset = 150; // offset matching scroll-mt-40
      const categoryElements = categorias
        .map((cat) => ({ id: cat.id, el: categoryRefs.current.get(cat.id) }))
        .filter((item): item is { id: string; el: HTMLElement } => item.el !== null && item.el !== undefined);

      if (categoryElements.length === 0) return;

      // Check if user scrolled near bottom of page -> activate last category
      const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 60;
      if (isAtBottom) {
        const lastCat = categoryElements[categoryElements.length - 1];
        setActiveCategory((prev) => (prev !== lastCat.id ? lastCat.id : prev));
        return;
      }

      // Find current category section in viewport
      let currentId = categoryElements[0].id;
      for (const item of categoryElements) {
        const rect = item.el.getBoundingClientRect();
        if (rect.top <= headerOffset) {
          currentId = item.id;
        } else {
          break;
        }
      }

      setActiveCategory((prev) => (prev !== currentId ? currentId : prev));
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(handleScroll);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [search, categorias]);

  // Auto-scroll category pill container horizontally when activeCategory changes
  useEffect(() => {
    if (!activeCategory) return;
    const pillEl = pillRefs.current.get(activeCategory);
    if (pillEl && pillContainerRef.current) {
      const container = pillContainerRef.current;
      const pillLeft = pillEl.offsetLeft;
      const pillWidth = pillEl.offsetWidth;
      const containerWidth = container.clientWidth;
      const targetScrollLeft = pillLeft - containerWidth / 2 + pillWidth / 2;

      container.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth",
      });
    }
  }, [activeCategory]);

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
        localName={local.nombre}
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

  return (
    <div className="flex flex-col min-h-full bg-stone-50">
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-30 glass border-b border-stone-200/50">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            {/* Local branding */}
            {/* Sin logo cargado va la inicial sobre el color del local, no una
                hamburguesa: el único cliente de hoy es un café y la carta se
                abría con el dibujo de otro rubro. La pareja `--brand` /
                `--brand-texto` ya viene resuelta por contraste desde el
                servidor, así que el marcador se lee con cualquier marca. */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-white/60 overflow-hidden"
              style={
                local.logo_url
                  ? { background: `${local.color_primario}18` }
                  : { background: "var(--brand)", color: "var(--brand-texto)" }
              }
            >
              {local.logo_url ? (
                <Image
                  src={local.logo_url}
                  alt={local.nombre}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : inicial ? (
                /* El nombre completo está en el `h1` de al lado: repetir la
                   letra suelta solo agrega ruido a un lector de pantalla. */
                <span aria-hidden className="font-black leading-none select-none">{inicial}</span>
              ) : (
                <BuildingStorefrontIcon aria-hidden className="w-6 h-6" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-extrabold text-stone-900 text-lg leading-tight truncate">
                {local.nombre}
              </h1>
              <p className="text-xs text-stone-500 truncate flex items-center gap-1">
                <MapPinIcon aria-hidden className="w-3 h-3 shrink-0" />
                {local.direccion}
              </p>
              {local.slogan && (
                <p className="text-xs text-stone-500 truncate">{local.slogan}</p>
              )}
            </div>
            {/* Cart icon in header */}
            {pedidosHabilitados && itemCount > 0 && (
              <button
                onClick={() => setShowCart(true)}
                // El botón es solo el icono: sin nombre, un lector de pantalla
                // anunciaba nada más que el número del globito.
                aria-label={`Ver pedido (${itemCount} producto${itemCount !== 1 ? "s" : ""})`}
                className="relative w-11 h-11 rounded-xl flex items-center justify-center shadow-md active:scale-90 transition-transform"
                style={{ background: "var(--brand)", color: "var(--brand-texto)" }}
              >
                <ShoppingCartIcon aria-hidden className="w-5 h-5" />
                <span
                  className="absolute -top-1 -right-1 w-5 h-5 bg-white text-xs font-black rounded-full flex items-center justify-center shadow-sm animate-pop"
                  style={{ color: "var(--accent-legible)" }}
                >
                  {itemCount}
                </span>
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="mt-3 relative">
            <MagnifyingGlassIcon aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            {/* `text-base` y no `text-sm`: por debajo de 16px iOS hace zoom solo
                al enfocar el buscador y deja la carta descuadrada, con el header
                pegajoso tapando media pantalla. */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en el menú..."
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-stone-100/80 border border-stone-200/60 text-base text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-[var(--brand)] focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Limpiar la búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-xs"
              >
                <XMarkIcon aria-hidden className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category pills — hidden during search */}
        {!search && (
          <div ref={pillContainerRef} className="overflow-x-auto scrollbar-hide px-4 pb-3">
            <div className="flex gap-2 max-w-lg mx-auto">
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  ref={(el) => { if (el) pillRefs.current.set(cat.id, el); }}
                  onClick={() => scrollToCategory(cat.id)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    activeCategory === cat.id
                      ? ""
                      : "bg-white text-stone-600 border border-stone-200/80 hover:border-[var(--brand)] hover:text-[var(--brand)]"
                  }`}
                  style={
                    activeCategory === cat.id
                      ? { background: "var(--brand)", color: "var(--brand-texto)", borderColor: "transparent" }
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

      {/* ===== PEDIDOS EN PAUSA =====
          El comensal no tiene por qué saber por qué. Se le dice qué puede hacer
          —llamar al garzón— en vez de dejarlo tocando un botón que no responde. */}
      {!pedidosHabilitados && (
        <div className="max-w-lg mx-auto w-full px-4 pt-3">
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <div className="flex items-start gap-2">
              <ClockIcon aria-hidden className="w-5 h-5 shrink-0 mt-0.5 text-stone-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-stone-800">
                  Por ahora no se puede pedir desde acá
                </p>
                <p className="text-xs text-stone-500 mt-0.5">
                  Podés mirar la carta y hacer tu pedido con el garzón.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== AVISO DE CAMBIOS EN EL CARRITO =====
          El total lo calcula el servidor, así que un carrito con precios viejos
          terminaba en una sorpresa al pagar. Acá se dice qué cambió, con nombre y
          monto, en vez de ajustarlo en silencio. */}
      {cambiosCarrito && (
        <div className="max-w-lg mx-auto w-full px-4 pt-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 animate-fade-in">
            <div className="flex items-start gap-2">
              <MegaphoneIcon aria-hidden className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-900">
                  Actualizamos tu pedido con la carta de hoy
                </p>
                <ul className="mt-1 space-y-0.5">
                  {cambiosCarrito.actualizados.map((c) => (
                    <li key={c.nombre} className="text-xs text-amber-800">
                      {c.nombre}: {formatPrice(c.precioAnterior)} → <strong>{formatPrice(c.precioNuevo)}</strong>
                    </li>
                  ))}
                  {cambiosCarrito.removidos.map((nombre) => (
                    <li key={nombre} className="text-xs text-amber-800">
                      {nombre}: ya no está disponible, lo sacamos del carrito
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => setCambiosCarrito(null)}
                className="text-amber-500 hover:text-amber-700 text-sm font-bold px-1"
                aria-label="Cerrar aviso"
              >
                <XMarkIcon aria-hidden className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PRODUCT LIST ===== */}
      <main id="contenido" className="flex-1 max-w-lg mx-auto w-full px-4 pt-4 pb-28">
        {/* Search results */}
        {filteredProducts ? (
          <section>
            <p className="text-xs text-stone-500 mb-3 font-medium">
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
                  puedePedir={pedidosHabilitados}
                />
              ))}
              {filteredProducts.length === 0 && (
                <div className="text-center py-16 text-stone-400">
                  <MagnifyingGlassIcon aria-hidden className="w-10 h-10 mx-auto mb-3" />
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
                <h2 className="text-base font-extrabold text-stone-800 mb-3 flex items-center gap-2">
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
                      puedePedir={pedidosHabilitados}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* ===== FLOATING CART BAR ===== */}
      {pedidosHabilitados && itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 safe-bottom animate-slide-up">
          <button
            onClick={() => setShowCart(true)}
            className="w-full max-w-lg mx-auto flex items-center justify-between h-[58px] px-5 rounded-2xl font-semibold shadow-xl hover:shadow-2xl active:scale-[0.98] transition-all"
            style={{ background: "var(--brand)", color: "var(--brand-texto)" }}
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm font-black">
                {itemCount}
              </span>
              <span className="text-base">Ver pedido</span>
            </div>
            <span className="text-lg font-bold">{formatPrice(total)}</span>
          </button>
        </div>
      )}

      {/* Modals */}
      {pedidosHabilitados && showCart && (
        <CartSheet onClose={() => setShowCart(false)} onCheckout={() => { setShowCart(false); setShowCheckout(true); }} />
      )}
      {pedidosHabilitados && showCheckout && local && (
        <CheckoutModal
          localId={local.id}
          // El slug identifica el intento de checkout guardado en localStorage,
          // para que un reintento tras recargar reuse el mismo id y no duplique.
          slug={slug}
          mesas={local.mesas ?? undefined}
          initialMesa={mesaDelQR}
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
  prod, icon, qty, flashed, onAdd, onUpdateQty, delay, puedePedir,
}: {
  prod: Producto; icon: string; qty: number; flashed: boolean;
  onAdd: () => void; onUpdateQty: (q: number) => void; delay: number;
  puedePedir: boolean;
}) {
  // Con los pedidos en pausa la tarjeta se muestra igual —precio incluido— pero
  // sin controles: un botón que no hace nada se lee como que la app está rota.
  const inCart = puedePedir && qty > 0;
  const imgSrc = prod.imagen_url;

  return (
    <div
      className={`stagger-card flex items-center gap-3 bg-white rounded-2xl p-3 border transition-all group ${
        inCart ? "shadow-sm" : "border-stone-100 shadow-sm hover:shadow-md hover:border-stone-200"
      } ${flashed ? "flash-added" : ""}`}
      style={{
        animationDelay: `${delay}ms`,
        // Tinte de la marca en vez de un naranja fijo: `color-mix` conserva el
        // tono del local y lo aclara, sea cual sea el color que eligió.
        ...(inCart ? { borderColor: "color-mix(in srgb, var(--brand) 35%, white)" } : {}),
      }}
    >
      {/* Product thumbnail */}
      {imgSrc ? (
        <div className="w-[60px] h-[60px] rounded-xl overflow-hidden shrink-0 transition-transform group-hover:scale-105 bg-stone-50">
          <Image
            src={imgSrc}
            alt={prod.nombre}
            width={60}
            height={60}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div
          className="w-[60px] h-[60px] rounded-xl flex items-center justify-center text-2xl shrink-0 transition-transform group-hover:scale-105 bg-gradient-to-br from-stone-50 to-stone-100/80"
          style={inCart ? { background: "color-mix(in srgb, var(--brand) 12%, white)" } : undefined}
        >
          {icon}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <h3 className="font-semibold text-stone-800 text-sm leading-tight">{prod.nombre}</h3>
        {prod.descripcion && (
          <p className="text-xs text-stone-500 mt-0.5 line-clamp-1 leading-snug">{prod.descripcion}</p>
        )}
        <p className="text-sm font-bold mt-1" style={{ color: "var(--accent-legible)" }}>{formatPrice(prod.precio)}</p>
      </div>

      {/* Add / Qty control */}
      {!puedePedir ? null : inCart ? (
        <div
          className="flex items-center gap-1 rounded-xl p-1 border animate-fade-in-fast"
          style={{
            background: "color-mix(in srgb, var(--brand) 10%, white)",
            borderColor: "color-mix(in srgb, var(--brand) 25%, white)",
          }}
        >
          <button
            onClick={() => onUpdateQty(qty - 1)}
            className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-bold transition-colors text-sm shadow-sm"
            style={{ color: "var(--accent-legible)" }}
          >−</button>
          <span className="w-7 text-center font-bold text-sm" style={{ color: "var(--accent-legible)" }}>{qty}</span>
          <button
            onClick={() => onUpdateQty(qty + 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-colors text-sm shadow-sm"
            style={{ background: "var(--brand)", color: "var(--brand-texto)" }}
          >+</button>
        </div>
      ) : (
        <button
          onClick={onAdd}
          // Con diez tarjetas en pantalla, diez botones que dicen solo "más" no
          // le sirven a nadie que no esté mirando: el nombre va en el botón.
          aria-label={`Agregar ${prod.nombre}`}
          className="w-10 h-10 rounded-xl active:scale-90 flex items-center justify-center transition-all shadow-sm"
          style={{ background: "var(--brand)", color: "var(--brand-texto)" }}
        >
          <PlusIcon aria-hidden className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

