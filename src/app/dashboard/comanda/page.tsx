"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { NavPanel } from "@/app/dashboard/nav-panel";
import { useRolLocal, avisarCambioDeLocal } from "@/lib/usar-rol";
import { NOTAS_RAPIDAS, agregarNotaRapida } from "@/lib/notas-rapidas";

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
  descripcion: string | null;
  imagen_url: string | null;
  precio: number;
  disponible: boolean;
  orden: number;
};

/**
 * Una línea de la comanda, no "un producto con cantidad".
 *
 * El mismo producto puede aparecer dos veces con notas distintas — "dos
 * italianos, uno sin mayo" es el caso de todos los días en una fuente de soda—,
 * y `pedido_items` guarda una fila por línea con su propia `notas`, así que la
 * base lo soporta sin cambios. Es el mismo campo que usa el carrito del
 * comensal en la carta pública.
 */
type Linea = {
  id: string;
  productoId: string;
  cantidad: number;
  notas: string;
};

/** Tope de `crear_pedido` para la nota de un ítem. */
const LARGO_MAX_NOTA = 300;

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
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [notas, setNotas] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<{ numero: number; mesa: string } | null>(null);
  const [cambiandoStock, setCambiandoStock] = useState<string | null>(null);
  const [verPedido, setVerPedido] = useState(false);
  const [detalle, setDetalle] = useState<Producto | null>(null);

  // Nota antes de agregar. Con cinco personas en la mesa y tres pidiendo
  // cambios, dejar las notas para el final obliga a acordarse de quién pidió
  // qué; ir y volver a otra pantalla por cada una es peor.
  const [notaPara, setNotaPara] = useState<Producto | null>(null);
  const [notaTexto, setNotaTexto] = useState("");
  const [notaCantidad, setNotaCantidad] = useState(1);

  // Agotar es destructivo y llega a la carta del comensal, así que se pregunta.
  const [confirmarAgotar, setConfirmarAgotar] = useState<Producto | null>(null);

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
          .select("id, categoria_id, nombre, descripcion, imagen_url, precio, disponible, orden")
          .eq("local_id", localId)
          .order("orden"),
        supabase.rpc("productos_frecuentes", { p_local_id: localId }),
      ]);

      if (!vigente) return;

      setMesas((local?.mesas as string[] | null) ?? []);
      setCategorias((cats ?? []) as Categoria[]);
      // Se cargan también los agotados: si desaparecieran de la lista, quien
      // marcó uno por error no tendría desde dónde revertirlo.
      setProductos((prods ?? []) as Producto[]);
      setFrecuentes(
        ((frec ?? []) as { producto_id: string }[]).map((f) => f.producto_id).filter(Boolean)
      );
      setCargando(false);
    })();

    return () => {
      vigente = false;
    };
  }, [supabase, localId]);

  /**
   * Un local recién dado de alta no tiene historial: sin frecuentes, esa pestaña
   * queda vacía y parece que el menú no cargó. Se cae a la primera categoría.
   *
   * Es un valor DERIVADO y no un efecto que corrija `pestana` después de
   * pintar: así no hay un primer render con la pestaña equivocada.
   */
  const pestanaEfectiva = useMemo(
    () =>
      pestana === FRECUENTES && frecuentes.length === 0 && categorias.length > 0
        ? categorias[0].id
        : pestana,
    [pestana, frecuentes.length, categorias]
  );

  // ------------------------------------------------------------------
  // Carrito
  // ------------------------------------------------------------------
  /**
   * Toque en la grilla: suma a la línea SIN nota de ese producto, o la crea.
   * El camino rápido no cambia — el garzón toca y suma, sin decidir nada.
   */
  const sumar = useCallback((productoId: string, delta: number) => {
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.productoId === productoId && l.notas === "");
      if (i === -1) {
        return delta > 0
          ? [...prev, { id: crypto.randomUUID(), productoId, cantidad: delta, notas: "" }]
          : prev;
      }
      const cantidad = prev[i].cantidad + delta;
      if (cantidad <= 0) return prev.filter((_, j) => j !== i);
      return prev.map((l, j) => (j === i ? { ...l, cantidad } : l));
    });
  }, []);

  /**
   * Agrega SIEMPRE una línea nueva, aunque el producto ya esté en el pedido.
   * Es lo que hace que "un italiano" y "un italiano sin mayo" convivan: si se
   * fusionaran, la nota de uno se le aplicaría a los dos.
   */
  const agregarConNota = useCallback((productoId: string, cantidad: number, notas: string) => {
    setLineas((prev) => [
      ...prev,
      { id: crypto.randomUUID(), productoId, cantidad, notas: notas.trim().slice(0, LARGO_MAX_NOTA) },
    ]);
  }, []);

  function abrirNota(p: Producto) {
    setNotaPara(p);
    setNotaTexto("");
    setNotaCantidad(1);
  }

  function confirmarNota() {
    if (!notaPara) return;
    // Sin texto es simplemente sumar: no tiene sentido crear una línea aparte
    // que después haya que juntar a mano.
    if (notaTexto.trim() === "") sumar(notaPara.id, notaCantidad);
    else agregarConNota(notaPara.id, notaCantidad, notaTexto);
    setNotaPara(null);
  }

  const cambiarCantidad = useCallback((lineaId: string, delta: number) => {
    setLineas((prev) =>
      prev
        .map((l) => (l.id === lineaId ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0)
    );
  }, []);

  const cambiarNota = useCallback((lineaId: string, texto: string) => {
    setLineas((prev) =>
      prev.map((l) => (l.id === lineaId ? { ...l, notas: texto.slice(0, LARGO_MAX_NOTA) } : l))
    );
  }, []);

  /**
   * Separa una unidad a su propia línea. Es lo que convierte "dos italianos" en
   * "un italiano" + "un italiano sin mayo" sin volver a marcarlo todo.
   */
  const dividir = useCallback((lineaId: string) => {
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.id === lineaId);
      if (i === -1 || prev[i].cantidad < 2) return prev;
      const original = { ...prev[i], cantidad: prev[i].cantidad - 1 };
      const nueva: Linea = {
        id: crypto.randomUUID(),
        productoId: prev[i].productoId,
        cantidad: 1,
        notas: prev[i].notas,
      };
      return [...prev.slice(0, i), original, nueva, ...prev.slice(i + 1)];
    });
  }, []);

  const quitarLinea = useCallback((lineaId: string) => {
    setLineas((prev) => prev.filter((l) => l.id !== lineaId));
  }, []);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const lineasConProducto = useMemo(
    () =>
      lineas
        .map((l) => ({ linea: l, producto: porId.get(l.productoId) }))
        .filter((x): x is { linea: Linea; producto: Producto } => Boolean(x.producto)),
    [lineas, porId]
  );

  /** Cuántas unidades hay en el pedido de cada producto, sumando sus líneas. */
  const cantidadPorProducto = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lineas) m.set(l.productoId, (m.get(l.productoId) ?? 0) + l.cantidad);
    return m;
  }, [lineas]);

  const total = lineasConProducto.reduce((acc, x) => acc + x.producto.precio * x.linea.cantidad, 0);
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
    if (pestanaEfectiva === FRECUENTES) {
      const orden = new Map(frecuentes.map((id, i) => [id, i]));
      return productos
        .filter((p) => orden.has(p.id))
        .sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
    }
    return productos.filter((p) => p.categoria_id === pestanaEfectiva);
  }, [productos, busqueda, pestanaEfectiva, frecuentes]);

  /**
   * "Se acabó el lomito" — y también "volvió a haber".
   *
   * El garzón es quien se entera primero, y el menú es del dueño: por eso va por
   * RPC, que es lo único que deja tocar `disponible` sin dejar tocar el precio.
   *
   * La tarjeta NO se saca de la grilla. La primera versión la filtraba, y eso la
   * convertía en una puerta de una sola dirección: un toque sin querer sacaba el
   * producto de la carta pública y desde acá no había cómo devolverlo.
   */
  async function cambiarDisponibilidad(p: Producto, disponible: boolean) {
    setCambiandoStock(p.id);
    const { error: errRpc } = await supabase.rpc("marcar_disponibilidad", {
      p_producto_id: p.id,
      p_disponible: disponible,
    });
    setCambiandoStock(null);

    if (errRpc) {
      setError(disponible ? "No se pudo reponer el producto." : "No se pudo marcar como agotado.");
      return;
    }

    setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, disponible } : x)));
    // Lo que se agotó no puede quedar en el pedido que se está armando, en
    // ninguna de sus líneas.
    if (!disponible) setLineas((prev) => prev.filter((l) => l.productoId !== p.id));
  }

  // ------------------------------------------------------------------
  // Envío
  // ------------------------------------------------------------------
  async function enviar() {
    if (!localId || !mesa || lineasConProducto.length === 0) return;
    setEnviando(true);
    setError(null);

    const { data, error: errRpc } = await supabase.rpc("crear_pedido", {
      p_local_id: localId,
      // `crear_pedido` exige un nombre no vacío y el garzón no se lo pregunta a
      // nadie: manda la mesa, que es lo que la cocina necesita leer.
      p_nombre: mesa,
      p_mesa: mesa,
      p_notas: notas.trim(),
      // Una entrada por línea: la nota viaja pegada a su ítem y la cocina la ve
      // en esa línea, no en un párrafo al final del pedido.
      p_items: lineasConProducto.map((x) => ({
        producto_id: x.producto.id,
        cantidad: x.linea.cantidad,
        notas: x.linea.notas.trim() || null,
      })),
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
    setLineas([]);
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
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 flex-wrap">
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

        {/* Ida y vuelta en un toque: el mismo turno pasa de tomar el pedido a
            mirar la cocina muchas veces por servicio. */}
        <Link
          href="/dashboard"
          className="px-3.5 py-2 rounded-lg text-xs font-semibold dash-text-secondary dash-bg-surface hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          Ver cocina
        </Link>
      </div>

      <div className="max-w-[1600px] mx-auto mt-2.5">
        <NavPanel actual="comanda" rol={rol} esPlatformAdmin={esPlatformAdmin} className="flex" />
      </div>
    </header>
  );

  // Paso 1 — la mesa
  if (!exito && !mesa) {
    return (
      <div className="flex flex-col min-h-dvh dashboard-dark">
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
      <div className="flex flex-col min-h-dvh dashboard-dark">
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
                className="w-full px-4 py-3 rounded-xl text-sm font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 active:scale-95 transition-transform"
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
    <div className="flex flex-col min-h-dvh dashboard-dark">
      {encabezado}

      <div className="px-4 md:px-6 py-3 border-b border-stone-800 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setMesa(null)}
            className="px-3 py-2 rounded-lg text-xs font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 active:scale-95 transition-transform"
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
                  pestanaEfectiva === FRECUENTES
                    ? "text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500"
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
                  pestanaEfectiva === c.id
                    ? "text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500"
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
                const cantidad = cantidadPorProducto.get(p.id) ?? 0;
                const tieneFicha = Boolean(p.imagen_url || p.descripcion);
                return (
                  <div
                    key={p.id}
                    className={`relative dash-card border-2 rounded-2xl p-3 flex flex-col justify-between transition-colors ${
                      !p.disponible ? "opacity-55 border-dashed" : cantidad > 0 ? "border-orange-500" : ""
                    }`}
                  >
                    {/* Los controles secundarios viven en la esquina y no debajo
                        del precio: ahí quedaban justo en el recorrido del dedo
                        que va a sumar, y agotar algo sin querer lo saca de la
                        carta del cliente. */}
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                      {tieneFicha && (
                        <button
                          onClick={() => setDetalle(p)}
                          title={`Ver ${p.nombre}`}
                          aria-label={`Ver la foto y los ingredientes de ${p.nombre}`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs dash-text-muted hover:text-orange-300 hover:bg-orange-500/10 transition-colors"
                        >
                          ⓘ
                        </button>
                      )}
                      {p.disponible && (
                        <button
                          onClick={() => setConfirmarAgotar(p)}
                          disabled={cambiandoStock === p.id}
                          title={`Marcar ${p.nombre} como agotado`}
                          aria-label={`Marcar ${p.nombre} como agotado`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/25 hover:text-red-300 disabled:opacity-40 transition-colors"
                        >
                          ⊘
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => sumar(p.id, 1)}
                      disabled={!p.disponible}
                      className="text-left flex-1 active:scale-95 transition-transform disabled:active:scale-100 disabled:cursor-default pr-14"
                    >
                      <p
                        className={`text-sm font-semibold leading-snug ${
                          p.disponible ? "dash-text-primary" : "dash-text-muted line-through"
                        }`}
                      >
                        {p.nombre}
                      </p>
                      <p className="text-xs dash-text-muted mt-1 tabular-nums">
                        {formatearPrecio(p.precio)}
                      </p>
                    </button>

                    {/* Agotado se queda en la grilla, en su lugar y reversible.
                        Si desapareciera, un toque por error no tendría vuelta
                        atrás desde esta pantalla. */}
                    {!p.disponible && (
                      <button
                        onClick={() => cambiarDisponibilidad(p, true)}
                        disabled={cambiandoStock === p.id}
                        className="mt-2.5 w-full py-2 rounded-lg text-[11px] font-bold text-amber-200 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
                      >
                        {cambiandoStock === p.id ? "Guardando…" : "Agotado · volver a poner"}
                      </button>
                    )}

                    {/* La nota se puede poner ANTES de agregar. Esperar al panel
                        del final obliga a acordarse de quién de la mesa pidió
                        qué cambio, que es justo lo que esta pantalla existe
                        para evitar. */}
                    {p.disponible && (
                      <button
                        onClick={() => abrirNota(p)}
                        className="mt-2 self-start px-2 py-1 rounded-lg text-[11px] font-semibold dash-bg-surface dash-text-secondary hover:text-orange-300 transition-colors"
                      >
                        📝 Con nota
                      </button>
                    )}

                    {p.disponible && cantidad > 0 && (
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
                          className="w-9 h-9 rounded-lg text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 text-lg font-bold active:scale-90 transition-transform"
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

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setVerPedido(true)}
              disabled={unidades === 0}
              className="text-left disabled:cursor-default"
            >
              <p className="text-[10px] dash-text-muted uppercase tracking-wider font-medium">
                {mesa} · {unidades} {unidades === 1 ? "ítem" : "ítems"}
                {unidades > 0 && <span className="text-orange-400"> · revisar</span>}
              </p>
              <p className="text-xl font-bold dash-text-primary tabular-nums">
                {formatearPrecio(total)}
              </p>
            </button>
            <button
              onClick={enviar}
              disabled={enviando || unidades === 0}
              className="px-6 py-3.5 rounded-xl text-sm font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 disabled:opacity-40 active:scale-95 transition-transform"
            >
              {enviando ? "Enviando…" : "Enviar a cocina"}
            </button>
          </div>
        </div>
      </div>

      {/* ===== FICHA DEL PRODUCTO =====
          Para mostrarle el plato al comensal o leerle los ingredientes sin
          tener que abrir la carta pública en otra pestaña. */}
      {detalle && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            className="dash-card border-2 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {detalle.imagen_url && (
              <Image
                src={detalle.imagen_url}
                alt={detalle.nombre}
                width={640}
                height={420}
                unoptimized
                className="w-full h-52 object-cover rounded-t-2xl"
              />
            )}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold dash-text-primary text-base leading-snug">{detalle.nombre}</h3>
                <span className="text-base font-bold dash-text-primary tabular-nums whitespace-nowrap">
                  {formatearPrecio(detalle.precio)}
                </span>
              </div>

              {detalle.descripcion ? (
                <p className="text-sm dash-text-secondary mt-2 leading-relaxed">{detalle.descripcion}</p>
              ) : (
                <p className="text-xs dash-text-muted mt-2 italic">
                  Este producto no tiene ingredientes cargados. Los escribe el dueño desde el menú.
                </p>
              )}

              <div className="flex gap-2 mt-4">
                {detalle.disponible && (
                  <button
                    onClick={() => {
                      sumar(detalle.id, 1);
                      setDetalle(null);
                    }}
                    className="flex-1 py-3 rounded-xl text-sm font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 active:scale-95 transition-transform"
                  >
                    Agregar al pedido
                  </button>
                )}
                <button
                  onClick={() => setDetalle(null)}
                  className="px-4 py-3 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== NOTA ANTES DE AGREGAR =====
          "Italiano sin mayo" se marca en el momento en que la persona lo pide,
          no al final. Cada uno entra como su propia línea del pedido. */}
      {notaPara && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setNotaPara(null)}
        >
          <div
            className="dash-card border-2 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-bold dash-text-primary text-base leading-snug">{notaPara.nombre}</h3>
              <span className="text-sm font-bold dash-text-primary tabular-nums whitespace-nowrap">
                {formatearPrecio(notaPara.precio)}
              </span>
            </div>

            <input
              type="text"
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value)}
              maxLength={LARGO_MAX_NOTA}
              autoFocus
              placeholder="Sin ají, bien cocido, aparte…"
              className="w-full mt-3 rounded-lg dash-bg-surface px-3 py-2.5 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
            />

            <div className="flex flex-wrap gap-1.5 mt-2">
              {NOTAS_RAPIDAS.map((n) => (
                <button
                  key={n}
                  onClick={() => setNotaTexto((prev) => agregarNotaRapida(prev, n))}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold dash-bg-surface dash-text-secondary hover:text-orange-300 transition-colors"
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 mt-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNotaCantidad((c) => Math.max(1, c - 1))}
                  aria-label="Quitar uno"
                  className="w-9 h-9 rounded-lg dash-bg-surface dash-text-primary text-lg font-bold active:scale-90 transition-transform"
                >
                  −
                </button>
                <span className="w-6 text-center text-base font-bold dash-text-primary tabular-nums">
                  {notaCantidad}
                </span>
                <button
                  onClick={() => setNotaCantidad((c) => Math.min(99, c + 1))}
                  aria-label="Agregar uno"
                  className="w-9 h-9 rounded-lg dash-bg-surface dash-text-primary text-lg font-bold active:scale-90 transition-transform"
                >
                  +
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setNotaPara(null)}
                  className="px-4 py-2.5 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarNota}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 active:scale-95 transition-transform"
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONFIRMAR AGOTAR =====
          Agotar sale del panel y llega a la carta del comensal, así que no puede
          pasar por un toque distraído mientras se marca un pedido. */}
      {confirmarAgotar && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setConfirmarAgotar(null)}
        >
          <div
            className="dash-card border-2 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold dash-text-primary text-base">
              ¿Agotar {confirmarAgotar.nombre}?
            </h3>
            <p className="text-[13px] dash-text-muted mt-2 leading-relaxed">
              Deja de aparecer en la carta del cliente al instante. Lo podés volver a poner desde acá
              mismo cuando haya de nuevo.
            </p>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmarAgotar(null)}
                className="flex-1 py-3 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const prod = confirmarAgotar;
                  setConfirmarAgotar(null);
                  cambiarDisponibilidad(prod, false);
                }}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all"
              >
                Sí, agotar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EL PEDIDO =====
          Cada línea con su propia nota. "Dos italianos, uno sin mayo" son dos
          líneas, y así llegan a la cocina: la nota va pegada a su ítem y no en
          un párrafo al final del pedido. */}
      {verPedido && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setVerPedido(false)}
        >
          <div
            className="dash-card border-2 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-stone-800 flex items-center justify-between gap-3">
              <h3 className="font-bold dash-text-primary text-base">Pedido de {mesa}</h3>
              <button
                onClick={() => setVerPedido(false)}
                className="px-3 py-1.5 rounded-lg dash-bg-surface dash-text-secondary text-xs font-semibold"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {lineasConProducto.map(({ linea, producto }) => (
                <div key={linea.id} className="rounded-xl dash-bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold dash-text-primary truncate">
                        {producto.nombre}
                      </p>
                      <p className="text-[11px] dash-text-muted tabular-nums">
                        {formatearPrecio(producto.precio * linea.cantidad)}
                      </p>
                    </div>
                    <button
                      onClick={() => cambiarCantidad(linea.id, -1)}
                      aria-label={`Quitar uno de ${producto.nombre}`}
                      className="w-8 h-8 rounded-lg dash-card dash-text-primary font-bold active:scale-90 transition-transform"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-bold dash-text-primary tabular-nums">
                      {linea.cantidad}
                    </span>
                    <button
                      onClick={() => cambiarCantidad(linea.id, 1)}
                      aria-label={`Agregar uno de ${producto.nombre}`}
                      className="w-8 h-8 rounded-lg text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 font-bold active:scale-90 transition-transform"
                    >
                      +
                    </button>
                  </div>

                  <input
                    type="text"
                    value={linea.notas}
                    onChange={(e) => cambiarNota(linea.id, e.target.value)}
                    maxLength={LARGO_MAX_NOTA}
                    placeholder="Sin ají, sin mayo, bien cocido…"
                    className="w-full mt-2.5 rounded-lg dash-card px-3 py-2 text-[13px] dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  />

                  <div className="flex items-center gap-3 mt-2">
                    {linea.cantidad > 1 && (
                      <button
                        onClick={() => dividir(linea.id)}
                        title="Separar una unidad para ponerle otra nota"
                        className="text-[11px] font-semibold text-orange-400 hover:text-orange-300 transition-colors"
                      >
                        Separar uno
                      </button>
                    )}
                    <button
                      onClick={() => quitarLinea(linea.id)}
                      className="text-[11px] font-semibold dash-text-muted hover:text-red-300 transition-colors"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}

              <div>
                <label
                  htmlFor="nota-pedido"
                  className="text-[11px] font-semibold dash-text-secondary block mb-1"
                >
                  Nota para todo el pedido
                </label>
                <input
                  id="nota-pedido"
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: todo junto, para compartir"
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-stone-800 flex items-center justify-between gap-3">
              <p className="text-xl font-bold dash-text-primary tabular-nums">
                {formatearPrecio(total)}
              </p>
              <button
                onClick={() => {
                  setVerPedido(false);
                  enviar();
                }}
                disabled={enviando || unidades === 0}
                className="px-6 py-3 rounded-xl text-sm font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 disabled:opacity-40 active:scale-95 transition-transform"
              >
                Enviar a cocina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
