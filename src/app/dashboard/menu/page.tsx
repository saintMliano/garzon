"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils";
import type { Categoria, Producto } from "@/types/database";
import AvisoSuscripcion from "../aviso-suscripcion";
import { NavPanel } from "@/app/dashboard/nav-panel";
import { useRolLocal, avisarCambioDeLocal } from "@/lib/usar-rol";
import { puede } from "@/lib/roles";

type ProductoForm = {
  id: string | null;
  nombre: string;
  descripcion: string;
  precio: string;
  categoria_id: string;
  disponible: boolean;
  orden: string;
  imagen_url: string;
};

type CategoriaForm = {
  id: string | null;
  nombre: string;
  icono: string;
  orden: string;
};

const EMPTY_PRODUCTO_FORM: ProductoForm = {
  id: null,
  nombre: "",
  descripcion: "",
  precio: "",
  categoria_id: "",
  disponible: true,
  orden: "0",
  imagen_url: "",
};

const EMPTY_CATEGORIA_FORM: CategoriaForm = {
  id: null,
  nombre: "",
  icono: "🍽️",
  orden: "0",
};

export default function MenuPage() {
  // El rol es por local: lo resuelve el hook compartido a partir del local
  // seleccionado. Solo decide qué se dibuja; quien niega es la base.
  const { rol } = useRolLocal();
  // `personal` entra acá solo a marcar que se acabó algo. Ocultarle los botones
  // es cortesía, no seguridad: la RLS ya le niega crear, editar y borrar, así
  // que si alguno se escapara solo conseguiría un error, nunca un cambio.
  const puedeEditar = puede(rol, "editar_menu");

  const supabase = useMemo(() => createClient(), []);

  const [localId, setLocalId] = useState<string | null>(null);
  const [localNombre, setLocalNombre] = useState("");
  const [resolvingLocal, setResolvingLocal] = useState(true);
  const [noLocal, setNoLocal] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategoriaId, setSelectedCategoriaId] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [categoriaForm, setCategoriaForm] = useState<CategoriaForm>(EMPTY_CATEGORIA_FORM);
  const [savingCategoria, setSavingCategoria] = useState(false);

  const [productoModalOpen, setProductoModalOpen] = useState(false);
  const [productoForm, setProductoForm] = useState<ProductoForm>(EMPTY_PRODUCTO_FORM);
  const [savingProducto, setSavingProducto] = useState(false);
  const [subiendoImagen, setSubiendoImagen] = useState(false);

  const [localesList, setLocalesList] = useState<{ id: string; nombre: string; slug: string }[]>([]);

  useEffect(() => {
    async function resolveLocal() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { data: adminRow } = await supabase
        .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      // Solo controla la visibilidad del link "Alta de local", no el acceso a datos.
      setIsPlatformAdmin(!!adminRow);

      // Los locales gestionables salen SIEMPRE de local_staff: la RLS exige esa fila
      // para leer/escribir datos, así que ser super-admin no basta por sí solo.
      const { data: staffRows, error: staffError } = await supabase
        .from("local_staff")
        .select("local_id, locales(id, nombre, slug)")
        .eq("user_id", user.id);

      let availableLocales: { id: string; nombre: string; slug: string }[] = [];

      if (!staffError) {
        availableLocales = (staffRows ?? [])
          .map((s) => s.locales)
          .filter((l): l is { id: string; nombre: string; slug: string } => Boolean(l && l.id))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
      }

      if (availableLocales.length === 0) {
        setResolvingLocal(false);
        setNoLocal(true);
        return;
      }

      setLocalesList(availableLocales);

      const savedLocalId = typeof window !== "undefined" ? localStorage.getItem("garzon_selected_local_id") : null;
      const validSaved = availableLocales.find((l) => l.id === savedLocalId);
      const chosen = validSaved || availableLocales[0];

      setLocalId(chosen.id);
      setLocalNombre(chosen.nombre);
      if (typeof window !== "undefined") {
        localStorage.setItem("garzon_selected_local_id", chosen.id);
      }
      setResolvingLocal(false);
    }
    resolveLocal();
  }, [supabase]);

  function handleLocalChange(newId: string) {
    const chosen = localesList.find((l) => l.id === newId);
    if (!chosen) return;
    setLocalId(chosen.id);
    setLocalNombre(chosen.nombre);
    if (typeof window !== "undefined") {
      avisarCambioDeLocal(chosen.id); // avisa a la nav: el rol es por local
      // y puede cambiar al cambiar de local.
    }
    fetchMenu(chosen.id);
  }

  async function fetchMenu(currentLocalId: string) {
    setLoading(true);
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from("categorias").select("*").eq("local_id", currentLocalId).order("orden"),
      supabase.from("productos").select("*").eq("local_id", currentLocalId).order("orden"),
    ]);

    const catList = (cats ?? []) as Categoria[];
    setCategorias(catList);
    setProductos((prods ?? []) as Producto[]);
    setSelectedCategoriaId((prev) => prev ?? catList[0]?.id ?? null);
    setLoading(false);
  }

  useEffect(() => {
    if (!localId) return;
    fetchMenu(localId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  // Oculta el toast de error automáticamente.
  useEffect(() => {
    if (!errorMsg) return;
    const timeout = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(timeout);
  }, [errorMsg]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function productosDeCategoria(categoriaId: string) {
    return productos.filter((p) => p.categoria_id === categoriaId);
  }

  // ===== Toggle disponibilidad (caso de uso estrella: "se acabó la palta") =====
  async function toggleDisponible(prod: Producto) {
    const nuevoValor = !prod.disponible;
    setProductos((prev) => prev.map((p) => (p.id === prod.id ? { ...p, disponible: nuevoValor } : p)));

    // Por RPC y no por UPDATE directo: es el mismo camino que usa la comanda,
    // donde quien marca "se acabó" puede ser `personal` — que a propósito no
    // tiene UPDATE sobre `productos`, porque la RLS no sabe distinguir la
    // columna `disponible` de la columna `precio`.
    const { error } = await supabase.rpc("marcar_disponibilidad", {
      p_producto_id: prod.id,
      p_disponible: nuevoValor,
    });

    if (error) {
      setProductos((prev) => prev.map((p) => (p.id === prod.id ? { ...p, disponible: prod.disponible } : p)));
      setErrorMsg("No se pudo actualizar la disponibilidad; reintenta.");
    }
  }

  // ===== Categorías =====
  function openNewCategoria() {
    setCategoriaForm(EMPTY_CATEGORIA_FORM);
    setCategoriaModalOpen(true);
  }

  function openEditCategoria(cat: Categoria) {
    setCategoriaForm({
      id: cat.id,
      nombre: cat.nombre,
      icono: cat.icono ?? "",
      orden: String(cat.orden),
    });
    setCategoriaModalOpen(true);
  }

  async function saveCategoria() {
    if (!localId || !categoriaForm.nombre.trim()) {
      setErrorMsg("El nombre de la categoría es obligatorio.");
      return;
    }
    setSavingCategoria(true);

    const payload = {
      nombre: categoriaForm.nombre.trim(),
      icono: categoriaForm.icono.trim() || null,
      orden: Number(categoriaForm.orden) || 0,
    };

    const { error } = categoriaForm.id
      ? await supabase.from("categorias").update(payload).eq("id", categoriaForm.id)
      : await supabase.from("categorias").insert({ ...payload, local_id: localId });

    setSavingCategoria(false);

    if (error) {
      setErrorMsg("No se pudo guardar la categoría; reintenta.");
      return;
    }

    setCategoriaModalOpen(false);
    fetchMenu(localId);
  }

  async function deleteCategoria(cat: Categoria) {
    const cantidad = productosDeCategoria(cat.id).length;
    const advertencia = cantidad > 0
      ? `¿Eliminar "${cat.nombre}"? Sus ${cantidad} producto(s) quedarán sin categoría.`
      : `¿Eliminar "${cat.nombre}"?`;
    if (!window.confirm(advertencia)) return;
    if (!localId) return;

    const { error } = await supabase.from("categorias").delete().eq("id", cat.id);
    if (error) {
      setErrorMsg("No se pudo eliminar la categoría; reintenta.");
      return;
    }
    if (selectedCategoriaId === cat.id) setSelectedCategoriaId(null);
    fetchMenu(localId);
  }

  // ===== Productos =====
  function openNewProducto() {
    setProductoForm({ ...EMPTY_PRODUCTO_FORM, categoria_id: selectedCategoriaId ?? categorias[0]?.id ?? "" });
    setProductoModalOpen(true);
  }

  function openEditProducto(prod: Producto) {
    setProductoForm({
      id: prod.id,
      nombre: prod.nombre,
      descripcion: prod.descripcion ?? "",
      precio: String(prod.precio),
      categoria_id: prod.categoria_id ?? "",
      disponible: prod.disponible,
      orden: String(prod.orden),
      imagen_url: prod.imagen_url ?? "",
    });
    setProductoModalOpen(true);
  }

  async function handleImagenChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !localId) return;

    const extFromName = file.name.split(".").pop();
    const ext = extFromName && extFromName.length <= 5 ? extFromName : "png";
    const ruta = `${localId}/${crypto.randomUUID()}.${ext}`;

    setSubiendoImagen(true);
    const { error } = await supabase.storage
      .from("menu")
      .upload(ruta, file, { upsert: true, cacheControl: "3600" });
    setSubiendoImagen(false);

    if (error) {
      setErrorMsg("No se pudo subir la imagen; reintenta.");
      return;
    }

    const { data } = supabase.storage.from("menu").getPublicUrl(ruta);
    setProductoForm((f) => ({ ...f, imagen_url: data.publicUrl }));
  }

  async function saveProducto() {
    if (!localId || !productoForm.nombre.trim() || !productoForm.categoria_id) {
      setErrorMsg("El nombre y la categoría son obligatorios.");
      return;
    }
    setSavingProducto(true);

    const payload = {
      nombre: productoForm.nombre.trim(),
      descripcion: productoForm.descripcion.trim() || null,
      precio: Math.round(Number(productoForm.precio)) || 0,
      categoria_id: productoForm.categoria_id,
      disponible: productoForm.disponible,
      orden: Number(productoForm.orden) || 0,
      imagen_url: productoForm.imagen_url || null,
    };

    const { error } = productoForm.id
      ? await supabase.from("productos").update(payload).eq("id", productoForm.id)
      : await supabase.from("productos").insert({ ...payload, local_id: localId });

    setSavingProducto(false);

    if (error) {
      setErrorMsg("No se pudo guardar el producto; reintenta.");
      return;
    }

    setProductoModalOpen(false);
    fetchMenu(localId);
  }

  async function deleteProducto(prod: Producto) {
    if (!window.confirm(`¿Eliminar "${prod.nombre}"?`)) return;
    if (!localId) return;

    const { error } = await supabase.from("productos").delete().eq("id", prod.id);
    if (error) {
      setErrorMsg("No se pudo eliminar el producto; reintenta.");
      return;
    }
    fetchMenu(localId);
  }

  if (resolvingLocal || (localId && loading)) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-dvh dashboard-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-4 border-stone-800 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
          </div>
          <p className="text-stone-500 text-sm font-medium">Cargando menú...</p>
        </div>
      </div>
    );
  }

  if (noLocal) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-dvh dashboard-dark px-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl dash-bg-surface flex items-center justify-center text-2xl">⚠️</div>
          <h2 className="font-bold dash-text-primary text-base">Sin local asociado</h2>
          <p className="text-stone-500 text-sm">Tu cuenta no está vinculada a ningún local. Contacta al administrador.</p>
          <button
            onClick={handleSignOut}
            className="mt-2 px-4 py-2 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
          >Cerrar sesión</button>
        </div>
      </div>
    );
  }

  const categoriaActiva = categorias.find((c) => c.id === selectedCategoriaId) ?? null;
  const productosActivos = categoriaActiva ? productosDeCategoria(categoriaActiva.id) : [];

  return (
    <div className="flex flex-col min-h-dvh dashboard-dark">
      {/* ===== HEADER ===== */}
      <header className="dash-header border-b px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-lg shadow-lg shadow-orange-500/20">
              🍔
            </div>
            <div className="min-w-0">
              {localesList.length > 1 ? (
                <div className="flex items-center gap-2">
                  <select
                    value={localId ?? ""}
                    onChange={(e) => handleLocalChange(e.target.value)}
                    className="bg-stone-900 border border-stone-700 text-white font-bold text-sm md:text-base rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer shadow-sm"
                  >
                    {localesList.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <h1 className="font-bold dash-text-primary text-base">{localNombre || "Garzón Digital"}</h1>
              )}
              <p className="text-[11px] dash-text-muted">Garzón Digital · Panel de control</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 md:gap-3 flex-wrap min-w-0">

            {/* La cuenta vive al lado de cerrar sesión, no entre las pestañas del
                local: la contraseña es de la persona, no del local. */}
            <Link
              href="/dashboard/cuenta"
              className="w-10 h-10 rounded-xl dash-bg-surface flex items-center justify-center text-lg hover:opacity-80 transition-opacity"
              title="Tu cuenta"
            >
              🔑
            </Link>

            <button
              onClick={handleSignOut}
              className="w-10 h-10 rounded-xl dash-bg-surface flex items-center justify-center text-lg hover:opacity-80 transition-opacity"
              title="Cerrar sesión"
            >
              🚪
            </button>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto mt-2.5">
          <NavPanel actual="menu" rol={rol} esPlatformAdmin={isPlatformAdmin} className="flex" />
        </div>
      </header>

      <AvisoSuscripcion localId={localId} />

      {/* ===== PANEL DE MENÚ ===== */}
      <main className="flex-1 p-3 md:p-5 overflow-x-auto">
        {!puedeEditar && (
          <div className="max-w-[1600px] mx-auto mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
            <p className="text-[11px] text-amber-200 leading-relaxed">
              Podés marcar lo que se acabó con el interruptor verde. Apenas lo hagas, el producto
              deja de aparecer en la carta del cliente. Los precios y el resto del menú los cambia
              el dueño.
            </p>
          </div>
        )}

        <div className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 min-w-0">
          {/* Panel izquierdo: categorías */}
          <div className="dash-card rounded-2xl border-2 p-3 h-fit">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="font-bold dash-text-primary text-sm">Categorías</h2>
              {puedeEditar && (
                <button
                  onClick={openNewCategoria}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.03] active:scale-95 transition-transform"
                >
                  ＋ Categoría
                </button>
              )}
            </div>

            {categorias.length === 0 ? (
              <div className="dash-col-empty rounded-xl border-2 border-dashed p-6 text-center dash-text-muted text-sm">
                Sin categorías todavía
              </div>
            ) : (
              <div className="space-y-1.5">
                {categorias.map((cat) => (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCategoriaId(cat.id)}
                    className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                      cat.id === selectedCategoriaId ? "dash-bg-surface" : "hover:dash-bg-surface"
                    }`}
                  >
                    <span className="text-lg">{cat.icono || "🍽️"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold dash-text-primary text-sm truncate">{cat.nombre}</p>
                      <p className="text-[11px] dash-text-muted">{productosDeCategoria(cat.id).length} producto(s)</p>
                    </div>
                    <div className={`flex items-center gap-1 opacity-0 transition-opacity ${puedeEditar ? "group-hover:opacity-100" : "hidden"}`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditCategoria(cat); }}
                        className="w-7 h-7 rounded-lg dash-bg-surface flex items-center justify-center text-xs hover:opacity-80"
                        title="Editar categoría"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCategoria(cat); }}
                        className="w-7 h-7 rounded-lg dash-bg-surface flex items-center justify-center text-xs hover:opacity-80"
                        title="Eliminar categoría"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel derecho: productos */}
          <div className="dash-card rounded-2xl border-2 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold dash-text-primary text-sm">
                {categoriaActiva ? `Productos · ${categoriaActiva.nombre}` : "Productos"}
              </h2>
              {puedeEditar && (
                <button
                  onClick={openNewProducto}
                  disabled={categorias.length === 0}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.03] active:scale-95 transition-transform disabled:opacity-40 disabled:hover:scale-100"
                >
                  ＋ Nuevo producto
                </button>
              )}
            </div>

            {!categoriaActiva ? (
              <div className="dash-col-empty rounded-xl border-2 border-dashed p-10 text-center dash-text-muted text-sm">
                {puedeEditar ? "Selecciona o crea una categoría para ver sus productos." : "Elige una categoría para ver sus productos."}
              </div>
            ) : productosActivos.length === 0 ? (
              <div className="dash-col-empty rounded-xl border-2 border-dashed p-10 text-center dash-text-muted text-sm">
                Esta categoría no tiene productos todavía.
              </div>
            ) : (
              <div className="space-y-2">
                {productosActivos.map((prod) => (
                  <div
                    key={prod.id}
                    className="flex items-center gap-3 rounded-xl dash-bg-surface px-3 py-3"
                  >
                    <button
                      onClick={() => toggleDisponible(prod)}
                      title={prod.disponible ? "Disponible · click para marcar agotado" : "Agotado · click para marcar disponible"}
                      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
                        prod.disponible ? "bg-green-500" : "bg-stone-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          prod.disponible ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${prod.disponible ? "dash-text-primary" : "dash-text-muted line-through"}`}>
                        {prod.nombre}
                      </p>
                      {prod.descripcion && (
                        <p className="text-[11px] dash-text-muted truncate">{prod.descripcion}</p>
                      )}
                    </div>

                    <span className="text-sm font-bold dash-text-primary tabular-nums whitespace-nowrap">
                      {formatPrice(prod.precio)}
                    </span>

                    <div className={`items-center gap-1 ${puedeEditar ? "flex" : "hidden"}`}>
                      <button
                        onClick={() => openEditProducto(prod)}
                        className="w-8 h-8 rounded-lg dash-bg-surface flex items-center justify-center text-xs hover:opacity-80"
                        title="Editar producto"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteProducto(prod)}
                        className="w-8 h-8 rounded-lg dash-bg-surface flex items-center justify-center text-xs hover:opacity-80"
                        title="Eliminar producto"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ===== MODAL CATEGORÍA ===== */}
      {categoriaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="dash-card rounded-2xl border-2 p-5 w-full max-w-sm">
            <h3 className="font-bold dash-text-primary text-base mb-4">
              {categoriaForm.id ? "Editar categoría" : "Nueva categoría"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Nombre</label>
                <input
                  value={categoriaForm.nombre}
                  onChange={(e) => setCategoriaForm((f) => ({ ...f, nombre: e.target.value }))}
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: Hamburguesas"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold dash-text-secondary block mb-1">Ícono (emoji)</label>
                  <input
                    value={categoriaForm.icono}
                    onChange={(e) => setCategoriaForm((f) => ({ ...f, icono: e.target.value }))}
                    className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="🍔"
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold dash-text-secondary block mb-1">Orden</label>
                  <input
                    type="number"
                    value={categoriaForm.orden}
                    onChange={(e) => setCategoriaForm((f) => ({ ...f, orden: e.target.value }))}
                    className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setCategoriaModalOpen(false)}
                className="px-4 py-2 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
              >
                Cancelar
              </button>
              <button
                onClick={saveCategoria}
                disabled={savingCategoria}
                className="px-4 py-2 rounded-xl text-sm font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-60"
              >
                {savingCategoria ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL PRODUCTO ===== */}
      {productoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="dash-card rounded-2xl border-2 p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold dash-text-primary text-base mb-4">
              {productoForm.id ? "Editar producto" : "Nuevo producto"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Imagen del producto</label>
                {productoForm.imagen_url ? (
                  <div className="flex items-center gap-3 rounded-xl dash-bg-surface px-3 py-2.5">
                    <Image
                      src={productoForm.imagen_url}
                      alt="Vista previa"
                      width={64}
                      height={64}
                      unoptimized
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                    <button
                      onClick={() => setProductoForm((f) => ({ ...f, imagen_url: "" }))}
                      className="px-3 py-2 rounded-lg dash-bg-surface dash-text-secondary text-xs font-semibold hover:opacity-80 transition-opacity"
                    >
                      Quitar imagen
                    </button>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center rounded-xl border-2 border-dashed border-stone-700 text-xs text-center py-6 cursor-pointer transition-opacity ${
                    subiendoImagen ? "opacity-60 pointer-events-none" : "hover:opacity-80"
                  } dash-text-muted`}>
                    {subiendoImagen ? "Subiendo…" : "Subir imagen"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={subiendoImagen}
                      onChange={handleImagenChange}
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Nombre</label>
                <input
                  value={productoForm.nombre}
                  onChange={(e) => setProductoForm((f) => ({ ...f, nombre: e.target.value }))}
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: Hamburguesa clásica"
                />
              </div>

              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Descripción</label>
                <textarea
                  value={productoForm.descripcion}
                  onChange={(e) => setProductoForm((f) => ({ ...f, descripcion: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  placeholder="Ingredientes, detalles..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold dash-text-secondary block mb-1">Precio (CLP)</label>
                  <div className="flex items-center rounded-lg dash-bg-surface px-3 focus-within:ring-2 focus-within:ring-orange-500">
                    <span className="text-sm dash-text-muted mr-1">$</span>
                    <input
                      type="number"
                      step="1"
                      value={productoForm.precio}
                      onChange={(e) => setProductoForm((f) => ({ ...f, precio: e.target.value }))}
                      className="w-full bg-transparent py-2 text-sm dash-text-primary outline-none"
                      placeholder="4500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold dash-text-secondary block mb-1">Orden</label>
                  <input
                    type="number"
                    value={productoForm.orden}
                    onChange={(e) => setProductoForm((f) => ({ ...f, orden: e.target.value }))}
                    className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Categoría</label>
                <select
                  value={productoForm.categoria_id}
                  onChange={(e) => setProductoForm((f) => ({ ...f, categoria_id: e.target.value }))}
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="" disabled>Selecciona una categoría</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.icono ? `${cat.icono} ` : ""}{cat.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between rounded-lg dash-bg-surface px-3 py-2.5">
                <span className="text-sm font-semibold dash-text-secondary">Disponible</span>
                <button
                  onClick={() => setProductoForm((f) => ({ ...f, disponible: !f.disponible }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    productoForm.disponible ? "bg-green-500" : "bg-stone-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      productoForm.disponible ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setProductoModalOpen(false)}
                className="px-4 py-2 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
              >
                Cancelar
              </button>
              <button
                onClick={saveProducto}
                disabled={savingProducto}
                className="px-4 py-2 rounded-xl text-sm font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-60"
              >
                {savingProducto ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de error, discreto y auto-ocultable */}
      {errorMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-red-950/80 border border-red-800/60 text-red-200 text-sm font-medium shadow-lg backdrop-blur-sm">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
