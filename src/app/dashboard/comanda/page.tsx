"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { NavPanel } from "@/app/dashboard/nav-panel";
import { useRolLocal, avisarCambioDeLocal } from "@/lib/usar-rol";

/**
 * Comanda: el garzón toma el pedido en la mesa.
 *
 * NO es la carta pública con otra piel. La carta está hecha para un comensal
 * eligiendo tres cosas con calma —fotos grandes, propina, teléfono, checkout de
 * varios pasos— y acá el objetivo es el contrario: marcar doce ítems en
 * cuarenta segundos sin pelear con la interfaz.
 *
 * Decisiones que no son estéticas:
 *  - La mesa se elige PRIMERO. Es lo único que el garzón sabe con certeza.
 *  - Sin fotos. Ocupan el espacio que necesitan los botones.
 *  - "Frecuentes" sale de `productos_frecuentes`, que devuelve unidades y NO
 *    plata: quien usa esta pantalla es `personal`, justamente a quien le
 *    cerramos la caja. Por eso no reusa `reporte_top_productos`.
 *  - El `client_request_id` se genera ANTES de enviar y se reusa mientras el
 *    intento siga vivo. Es la diferencia entre un pedido y dos cuando el wifi
 *    del local se corta a mitad del POST.
 *  - No se pide teléfono: es un pedido de mesa y no hay razón de negocio para
 *    guardar un dato personal más.
 */

type Categoria = { id: string; nombre: string; icono: string | null; orden: number };
type Producto = {
  id: string;
  categoria_id: string | null;
  nombre: string;
  precio: number;
  disponible: boolean;
  orden: number;
};

/** Pestaña sintética: no es una categoría del menú. */
const FRECUENTES = "frecuentes";

function formatearPrecio(v: number) {
  return `$${v.toLocaleString("es-CL")}`;
}

export default function ComandaPage() {
  const supabase = useMemo(() => createClient(), []);
  const { cargando: cargandoRol, rol, localId, localNombre, locales, esPlatformAdmin } = useRolLocal();

  const [mesas, setMesas] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [frecuentes, setFrecuentes] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);

  const [mesa, setMesa] = useState<string | null>(null);
  const [pestana, setPestana] = useState<string>(FRECUENTES);
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [notas, setNotas] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<{ numero: number; mesa: string } | null>(null);
  const [agotado, setAgotado] = useState<string | null>(null);

  // Se genera una vez por intento. Si el envío falla y el garzón reintenta, va
  // el MISMO id: `crear_pedido` es idempotente y devuelve el pedido ya creado
  // en lugar de duplicarlo.
  const intentoRef = useRef<string>(crypto.randomUUID());

  // ------------------------------------------------------------------
  // Carga del menú del local
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!localId) return;
    let vigente = true;

    (async () => {
      setCargando(true);

      const [{ data: local }, { data: cats }, { data: prods }, { data: frec }] = await Promise.all([
        supabase.from("locales").select("mesas").eq("id", localId).maybeSingle(),
        supabase.from("categorias").select("id, nombre, icono, orden").eq("local_id", localId).order("orden"),
        supabase
          .from("productos")
          .select("id, categoria_id, nombre, precio, disponible, orden")
          .eq("local_id", localId)
          .order("orden"),
        supabase.rpc("productos_frecuentes", { p_local_id: localId }),
      ]);

      if (!vigente) return;

      setMesas((local?.mesas as string[] | null) ?? []);
      setCategorias((cats ?? []) as Categoria[]);
      setProductos(((prods ?? []) as Producto[]).filter((p) => p.disponible));
      setFrecuentes(
        ((frec ?? []) as { producto_id: string }[]).map((f) => f.producto_id).filter(Boolean)
      );
      setCargando(false);
    })();

    return () => {
      vigente = false;
    };
  }, [supabase, localId]);

  // Un local recién dado de alta no tiene historial: sin frecuentes, la pestaña
  // vacía es una trampa. Se cae a la primera categoría real.
  useEffect(() => {
    if (cargando) return;
    if (pestana === FRECUENTES && frecuentes.length === 0 && categorias.length > 0) {
      setPestana(categorias[0].id);
    }
  }, [cargando, frecuentes.length, categorias, pestana]);

  // ------------------------------------------------------------------
  // Carrito
  // ------------------------------------------------------------------
  const sumar = useCallback((id: string, delta: number) => {
    setCarrito((prev) => {
      const cantidad = (prev[id] ?? 0) + delta;
      if (cantidad <= 0) {
        const { [id]: _fuera, ...resto } = prev;
        void _fuera;
        return resto;
      }
      return { ...prev, [id]: cantidad };
    });
  }, []);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const lineas = useMemo(
    () =>
      Object.entries(carrito)
        .map(([id, cantidad]) => ({ producto: porId.get(id), cantidad }))
        .filter((l): l is { producto: Producto; cantidad: number } => Boolean(l.producto)),
    [carrito, porId]
  );

  const total = lineas.reduce((acc, l) => acc + l.producto.precio * l.cantidad, 0);
  const unidades = lineas.reduce((acc, l) => acc + l.cantidad, 0);

  // ------------------------------------------------------------------
  // Grilla visible
  // ------------------------------------------------------------------
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      // Buscar manda por sobre la pestaña: si el garzón escribe, quiere el
      // producto, no la categoría donde vive.
      return productos.filter((p) => p.nombre.toLowerCase().includes(q));
    }
    if (pestana === FRECUENTES) {
      const orden = new Map(frecuentes.map((id, i) => [id, i]));
      return productos
        .filter((p) => orden.has(p.id))
        .sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
    }
    return productos.filter((p) => p.categoria_id === pestana);
  }, [productos, busqueda, pestana, frecuentes]);

  /**
   * "Se acabó el lomito". El garzón es quien se entera primero, y el menú es
   * del dueño: por eso va por RPC, que es lo único que deja tocar `disponible`
   * sin dejar tocar el precio.
   */
  async function marcarAgotado(p: Producto) {
    const { error: errRpc } = await supabase.rpc("marcar_disponibilidad", {
      p_producto_id: p.id,
      p_disponible: false,
    });
    if (errRpc) {
      setError("No se pudo marcar como agotado.");
      return;
    }
    setProductos((prev) => prev.filter((x) => x.id !== p.id));
    sumar(p.id, -(carrito[p.id] ?? 0));
    setAgotado(p.nombre);
  }

  // ------------------------------------------------------------------
  // Envío
  // ------------------------------------------------------------------
  async function enviar() {
    if (!localId || !mesa || lineas.length === 0) return;
    setEnviando(true);
    setError(null);

    const { data, error: errRpc } = await supabase.rpc("crear_pedido", {
      p_local_id: localId,
      // `crear_pedido` exige un nombre no vacío y el garzón no se lo pregunta a
      // nadie: manda la mesa, que es lo que la cocina necesita leer.
      p_nombre: mesa,
      p_mesa: mesa,
      p_notas: notas.trim(),
      p_items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
      p_client_request_id: intentoRef.current,
      p_tipo_entrega: "mesa",
    });

    if (errRpc) {
      setError(errRpc.message);
      setEnviando(false);
      return;
    }

    const { data: creado } = await supabase
      .from("pedidos")
      .select("numero_pedido")
      .eq("id", data as string)
      .maybeSingle();

    setExito({ numero: creado?.numero_pedido ?? 0, mesa });
    setCarrito({});
    setNotas("");
    setBusqueda("");
    // Recién acá se renueva: el intento anterior ya llegó.
    intentoRef.current = crypto.randomUUID();
    setEnviando(false);
  }

  function otroPedido() {
    setExito(null);
    setMesa(null);
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const encabezado = (
    <header className="dash-header border-b px-4 md:px-6 py-3 shrink-0">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-lg shadow-lg shadow-orange-500/20">
            🍔
          </div>
          <div className="min-w-0">
            {locales.length > 1 ? (
              <select
                value={localId ?? ""}
                onChange={(e) => avisarCambioDeLocal(e.target.value)}
                className="font-bold dash-text-primary text-base bg-transparent outline-none cursor-pointer"
              >
                {locales.map((l) => (
                  <option key={l.id} value={l.id} className="dashboard-dark">
                    {l.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <h1 className="font-bold dash-text-primary text-base truncate">
                {localNombre ?? "Comanda"}
              </h1>
            )}
            <p className="text-[11px] dash-text-muted">Garzón Digital · Tomar pedido</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NavPanel actual="comanda" rol={rol} esPlatformAdmin={esPlatformAdmin} />
          {/* Ida y vuelta en un toque: el mismo turno pasa de tomar el pedido a
              mirar la cocina muchas veces por servicio. */}
          <Link
            href="/dashboard"
            className="px-3.5 py-2 rounded-lg text-xs font-semibold dash-text-secondary dash-bg-surface hover:opacity-80 transition-opacity whitespace-nowrap"
          >
            Ver cocina
          </Link>
        </div>
      </div>
    </header>
  );

  // Paso 1 — la mesa
  if (!exito && !mesa) {
    return (
      <div className="flex flex-col min-h-screen dashboard-dark">
        {encabezado}
        <main className="flex-1 p-4 md:p-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-bold dash-text-primary text-lg">¿Para qué mesa?</h2>
            <p className="text-xs dash-text-muted mt-1">
              Se elige primero porque es lo único que sabés con certeza al llegar.
            </p>

            {cargandoRol || cargando ? (
              <p className="text-xs dash-text-muted mt-6">Cargando…</p>
            ) : mesas.length === 0 ? (
              <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-xs text-amber-200 leading-relaxed">
                  Este local todavía no tiene mesas configuradas. Se cargan en Identidad, y las
                  configura el dueño.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mt-5">
                {mesas.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMesa(m)}
                    className="dash-card border-2 rounded-2xl py-6 text-sm font-bold dash-text-primary hover:border-orange-500 active:scale-95 transition-all"
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Paso 3 — confirmación
  if (exito) {
    return (
      <div className="flex flex-col min-h-screen dashboard-dark">
        {encabezado}
        <main className="flex-1 p-4 md:p-6 flex items-center justify-center">
          <div className="max-w-sm w-full dash-card rounded-2xl border-2 p-6 text-center">
            <div className="text-4xl">✅</div>
            <h2 className="font-bold dash-text-primary text-lg mt-3">Pedido enviado</h2>
            <p className="text-sm dash-text-secondary mt-1">
              N.º {exito.numero} · {exito.mesa}
            </p>
            <p className="text-[11px] dash-text-muted mt-2 leading-relaxed">
              Ya está en la pantalla de la cocina.
            </p>
            <div className="flex flex-col gap-2 mt-5">
              <button
                onClick={otroPedido}
                className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 active:scale-95 transition-transform"
              >
                Tomar otro pedido
              </button>
              <Link
                href="/dashboard"
                className="w-full px-4 py-3 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
              >
                Ver la cocina
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Paso 2 — la grilla
  return (
    <div className="flex flex-col min-h-screen dashboard-dark">
      {encabezado}

      <div className="px-4 md:px-6 py-3 border-b border-stone-800 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setMesa(null)}
            className="px-3 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 active:scale-95 transition-transform"
          >
            {mesa} ▾
          </button>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto…"
            className="flex-1 min-w-[10rem] rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {!busqueda && (
        <div className="px-4 md:px-6 py-2 border-b border-stone-800 overflow-x-auto shrink-0">
          <div className="max-w-[1600px] mx-auto flex gap-1.5">
            {frecuentes.length > 0 && (
              <button
                onClick={() => setPestana(FRECUENTES)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  pestana === FRECUENTES
                    ? "text-white bg-gradient-to-r from-orange-500 to-amber-500"
                    : "dash-bg-surface dash-text-secondary"
                }`}
              >
                ⭐ Frecuentes
              </button>
            )}
            {categorias.map((c) => (
              <button
                key={c.id}
                onClick={() => setPestana(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  pestana === c.id
                    ? "text-white bg-gradient-to-r from-orange-500 to-amber-500"
                    : "dash-bg-surface dash-text-secondary"
                }`}
              >
                {c.icono} {c.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 p-3 md:p-5 pb-40">
        <div className="max-w-[1600px] mx-auto">
          {cargando ? (
            <p className="text-xs dash-text-muted">Cargando el menú…</p>
          ) : visibles.length === 0 ? (
            <p className="text-xs dash-text-muted">
              {busqueda ? "Ningún producto con ese nombre." : "No hay productos disponibles acá."}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {visibles.map((p) => {
                const cantidad = carrito[p.id] ?? 0;
                return (
                  <div
                    key={p.id}
                    className={`dash-card border-2 rounded-2xl p-3 flex flex-col justify-between transition-colors ${
                      cantidad > 0 ? "border-orange-500" : ""
                    }`}
                  >
                    <button
                      onClick={() => sumar(p.id, 1)}
                      className="text-left flex-1 active:scale-95 transition-transform"
                    >
                      <p className="text-sm font-semibold dash-text-primary leading-snug">{p.nombre}</p>
                      <p className="text-xs dash-text-muted mt-1 tabular-nums">
                        {formatearPrecio(p.precio)}
                      </p>
                    </button>

                    <button
                      onClick={() => marcarAgotado(p)}
                      title={`Marcar ${p.nombre} como agotado`}
                      className="self-start mt-1.5 text-[10px] font-semibold dash-text-muted hover:text-red-300 transition-colors"
                    >
                      Se acabó
                    </button>

                    {cantidad > 0 && (
                      <div className="flex items-center justify-between gap-2 mt-2.5">
                        <button
                          onClick={() => sumar(p.id, -1)}
                          aria-label={`Quitar uno de ${p.nombre}`}
                          className="w-9 h-9 rounded-lg dash-bg-surface dash-text-primary text-lg font-bold active:scale-90 transition-transform"
                        >
                          −
                        </button>
                        <span className="text-base font-bold dash-text-primary tabular-nums">
                          {cantidad}
                        </span>
                        <button
                          onClick={() => sumar(p.id, 1)}
                          aria-label={`Agregar uno de ${p.nombre}`}
                          className="w-9 h-9 rounded-lg text-white bg-gradient-to-r from-orange-500 to-amber-500 text-lg font-bold active:scale-90 transition-transform"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Pie fijo: el total y el botón nunca quedan fuera de pantalla. */}
      <div className="fixed bottom-0 inset-x-0 dash-header border-t px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto space-y-2">
          {error && (
            <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {agotado && (
            <p className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <span>&quot;{agotado}&quot; quedó agotado. Ya no aparece en la carta.</span>
              <button onClick={() => setAgotado(null)} className="font-bold shrink-0">
                Cerrar
              </button>
            </p>
          )}

          {unidades > 0 && (
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Nota para la cocina (opcional)"
              className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
            />
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] dash-text-muted uppercase tracking-wider font-medium">
                {mesa} · {unidades} {unidades === 1 ? "ítem" : "ítems"}
              </p>
              <p className="text-xl font-bold dash-text-primary tabular-nums">
                {formatearPrecio(total)}
              </p>
            </div>
            <button
              onClick={enviar}
              disabled={enviando || unidades === 0}
              className="px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 disabled:opacity-40 active:scale-95 transition-transform"
            >
              {enviando ? "Enviando…" : "Enviar a cocina"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
