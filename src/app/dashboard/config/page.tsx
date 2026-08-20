"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { Local } from "@/types/database";
import {
  CONTRASTE_AA,
  TEXTO_CLARO,
  contraste,
  legibleSobre,
  parseHex,
  textoSobre,
} from "@/lib/color";
import AvisoSuscripcion from "../aviso-suscripcion";
import { NavPanel } from "@/app/dashboard/nav-panel";
import { useRolLocal, avisarCambioDeLocal } from "@/lib/usar-rol";

/** El menú público se pinta sobre fondo blanco: es contra eso que hay que leerse. */
const FONDO_MENU = "#ffffff";
const COLOR_POR_DEFECTO = "#f97316";

/** `input type="color"` solo acepta #rrggbb: un "#fff" guardado a mano lo dejaría en negro. */
function aColorInput(color: string): string {
  const rgb = parseHex(color);
  if (!rgb) return COLOR_POR_DEFECTO;
  const dos = (n: number) => n.toString(16).padStart(2, "0");
  return `#${dos(rgb.r)}${dos(rgb.g)}${dos(rgb.b)}`;
}

/** Razón de contraste junto a cada selector: ✓ si pasa AA, ⚠ si no. */
function ChipContraste({
  razon,
  detalle,
  completo,
}: {
  razon: number;
  detalle: string;
  completo: boolean;
}) {
  if (!completo) {
    return (
      <p className="mt-1.5 text-[11px] dash-text-muted">
        Escribe el color completo (#rgb o #rrggbb) para ver el contraste.
      </p>
    );
  }
  const pasa = razon >= CONTRASTE_AA;
  return (
    <p className={`mt-1.5 text-[11px] font-medium ${pasa ? "text-green-400" : "text-amber-400"}`}>
      <span aria-hidden>{pasa ? "✓" : "⚠"}</span> {razon.toFixed(1)}:1 · {detalle}
    </p>
  );
}

export default function ConfigPage() {
  // El rol es por local: lo resuelve el hook compartido a partir del local
  // seleccionado. Solo decide qué se dibuja; quien niega es la base.
  const { rol } = useRolLocal();

  const supabase = useMemo(() => createClient(), []);

  const [localId, setLocalId] = useState<string | null>(null);
  const [localNombre, setLocalNombre] = useState("");
  const [resolvingLocal, setResolvingLocal] = useState(true);
  const [noLocal, setNoLocal] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const [nombre, setNombre] = useState("");
  const [slogan, setSlogan] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [colorPrimario, setColorPrimario] = useState(COLOR_POR_DEFECTO);
  const [colorAcento, setColorAcento] = useState(COLOR_POR_DEFECTO);
  // Último color COMPLETO de cada campo: es lo que alimenta la vista previa, para
  // que no parpadee mientras el dueño tipea el hex a mano ("#f", "#f9").
  const [primarioVista, setPrimarioVista] = useState(COLOR_POR_DEFECTO);
  const [acentoVista, setAcentoVista] = useState(COLOR_POR_DEFECTO);
  const [logoUrl, setLogoUrl] = useState("");

  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [localesList, setLocalesList] = useState<{ id: string; nombre: string; slug: string }[]>([]);

  // El campo hex se deja escribir libre (puede quedar a medio tipear); la vista
  // previa solo avanza cuando el valor es un color completo.
  function cambiarPrimario(valor: string) {
    setColorPrimario(valor);
    if (parseHex(valor)) setPrimarioVista(valor);
  }

  function cambiarAcento(valor: string) {
    setColorAcento(valor);
    if (parseHex(valor)) setAcentoVista(valor);
  }

  async function fetchLocalConfig(targetLocalId: string) {
    const { data: local } = await supabase
      .from("locales").select("*").eq("id", targetLocalId).single();

    setLocalId(targetLocalId);
    if (local) {
      const l = local as Local;
      setLocalNombre(l.nombre ?? "");
      setNombre(l.nombre ?? "");
      setSlogan(l.slogan ?? "");
      setDireccion(l.direccion ?? "");
      setTelefono(l.telefono ?? "");
      cambiarPrimario(l.color_primario ?? COLOR_POR_DEFECTO);
      cambiarAcento(l.color_acento ?? COLOR_POR_DEFECTO);
      setLogoUrl(l.logo_url ?? "");
    }
  }

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

      if (typeof window !== "undefined") {
        localStorage.setItem("garzon_selected_local_id", chosen.id);
      }
      await fetchLocalConfig(chosen.id);
      setResolvingLocal(false);
    }
    resolveLocal();
  }, [supabase]);

  function handleLocalChange(newId: string) {
    const chosen = localesList.find((l) => l.id === newId);
    if (!chosen) return;
    if (typeof window !== "undefined") {
      avisarCambioDeLocal(chosen.id); // avisa a la nav: el rol es por local
      // y puede cambiar al cambiar de local.
    }
    fetchLocalConfig(chosen.id);
  }

  // Oculta los toasts automáticamente.
  useEffect(() => {
    if (!errorMsg) return;
    const timeout = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(timeout);
  }, [errorMsg]);

  useEffect(() => {
    if (!savedMsg) return;
    const timeout = setTimeout(() => setSavedMsg(false), 3000);
    return () => clearTimeout(timeout);
  }, [savedMsg]);

  // ===== Legibilidad de la marca, recalculada en vivo =====
  // Los avisos solo se muestran con un hex completo; con el valor a medio escribir
  // se sigue usando el último color válido para no alarmar por nada.
  const primarioCompleto = parseHex(colorPrimario) !== null;
  const acentoCompleto = parseHex(colorAcento) !== null;

  // El primario es FONDO de los botones: el sistema le elige el texto que se lea.
  const textoBoton = textoSobre(primarioVista);
  const contrasteBoton = contraste(primarioVista, textoBoton);
  // El acento es TEXTO (los precios) sobre el blanco del menú.
  const contrasteAcento = contraste(acentoVista, FONDO_MENU);
  const acentoLegible = legibleSobre(acentoVista, FONDO_MENU);
  const acentoNecesitaAjuste = acentoCompleto && contrasteAcento < CONTRASTE_AA;

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !localId) return;

    const extFromName = file.name.split(".").pop();
    const ext = extFromName && extFromName.length <= 5 ? extFromName : "png";
    const ruta = `${localId}/logo-${crypto.randomUUID()}.${ext}`;

    setSubiendoLogo(true);
    const { error } = await supabase.storage
      .from("menu")
      .upload(ruta, file, { upsert: true, cacheControl: "3600" });
    setSubiendoLogo(false);

    if (error) {
      setErrorMsg("No se pudo subir el logo; reintenta.");
      return;
    }

    const { data } = supabase.storage.from("menu").getPublicUrl(ruta);
    setLogoUrl(data.publicUrl);
  }

  async function handleGuardar() {
    if (!localId || !nombre.trim()) {
      setErrorMsg("El nombre del local es obligatorio.");
      return;
    }
    setSaving(true);

    const { error } = await supabase
      .from("locales")
      .update({
        nombre: nombre.trim(),
        slogan: slogan.trim() || null,
        direccion: direccion.trim() || null,
        telefono: telefono.trim() || null,
        color_primario: colorPrimario,
        color_acento: colorAcento,
        logo_url: logoUrl || null,
      })
      .eq("id", localId);

    setSaving(false);

    if (error) {
      setErrorMsg("No se pudo guardar los cambios; reintenta.");
      return;
    }

    setLocalNombre(nombre.trim());
    setSavedMsg(true);
  }

  if (resolvingLocal) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen dashboard-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-4 border-stone-800 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
          </div>
          <p className="text-stone-500 text-sm font-medium">Cargando identidad...</p>
        </div>
      </div>
    );
  }

  if (noLocal) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen dashboard-dark px-6">
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

  return (
    <div className="flex flex-col min-h-screen dashboard-dark">
      {/* ===== HEADER ===== */}
      <header className="dash-header border-b px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-lg shadow-lg shadow-orange-500/20">
              🍔
            </div>
            <div>
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

          <div className="flex items-center gap-4 md:gap-6">
            <NavPanel actual="config" rol={rol} esPlatformAdmin={isPlatformAdmin} />

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
      </header>

      <AvisoSuscripcion localId={localId} />

      {/* ===== PANEL DE IDENTIDAD ===== */}
      <main className="flex-1 p-3 md:p-5">
        <div className="max-w-2xl mx-auto dash-card rounded-2xl border-2 p-5">
          <h2 className="font-bold dash-text-primary text-base mb-4">Identidad del local</h2>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold dash-text-secondary block mb-1">Nombre</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Ej: Burger House Viña"
              />
            </div>

            <div>
              <label className="text-xs font-semibold dash-text-secondary block mb-1">Eslogan</label>
              <input
                value={slogan}
                onChange={(e) => setSlogan(e.target.value)}
                className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Ej: Las mejores hamburguesas de Viña"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Dirección</label>
                <input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: Av. San Martín 123"
                />
              </div>
              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Teléfono</label>
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: +56 9 1234 5678"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold dash-text-secondary block mb-1">Color primario</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={aColorInput(primarioVista)}
                  onChange={(e) => cambiarPrimario(e.target.value)}
                  className="w-11 h-10 rounded-lg dash-bg-surface cursor-pointer border-0 p-1"
                />
                <input
                  value={colorPrimario}
                  onChange={(e) => cambiarPrimario(e.target.value)}
                  className="flex-1 rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  placeholder="#f97316"
                  maxLength={7}
                />
                <div
                  className="w-10 h-10 rounded-lg shrink-0 border border-stone-700"
                  style={{ backgroundColor: primarioVista }}
                  title="Vista previa"
                />
              </div>
              <ChipContraste
                razon={contrasteBoton}
                completo={primarioCompleto}
                detalle={`el texto de los botones se pinta ${
                  textoBoton === TEXTO_CLARO ? "blanco" : "oscuro"
                } automáticamente`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold dash-text-secondary block mb-1">Color de acento (precios y detalles)</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={aColorInput(acentoVista)}
                  onChange={(e) => cambiarAcento(e.target.value)}
                  className="w-11 h-10 rounded-lg dash-bg-surface cursor-pointer border-0 p-1"
                />
                <input
                  value={colorAcento}
                  onChange={(e) => cambiarAcento(e.target.value)}
                  className="flex-1 rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  placeholder="#f97316"
                  maxLength={7}
                />
                <div
                  className="w-10 h-10 rounded-lg shrink-0 border border-stone-700"
                  style={{ backgroundColor: acentoVista }}
                  title="Vista previa"
                />
              </div>
              <ChipContraste
                razon={contrasteAcento}
                completo={acentoCompleto}
                detalle="contraste de los precios sobre el fondo blanco del menú"
              />
            </div>

            {/* ===== Vista previa real: lo que va a ver el cliente ===== */}
            <div className="rounded-xl border border-stone-800 bg-stone-950/40 p-4">
              <p className="text-xs font-semibold dash-text-secondary">Vista previa del menú</p>
              <p className="text-[11px] dash-text-muted mt-0.5">
                Así se ven tus colores sobre el fondo claro que ve el cliente.
              </p>

              <div className="mt-3 rounded-xl bg-white p-4 space-y-4">
                <div
                  className="rounded-xl px-4 py-2.5 text-center text-sm font-bold"
                  style={{ backgroundColor: primarioVista, color: textoBoton }}
                >
                  Ver pedido · $12.500
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                      Tu acento
                    </p>
                    <p className="text-lg font-bold" style={{ color: acentoVista }}>
                      $12.500
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                      {acentoNecesitaAjuste ? "Corregido para el menú" : "En el menú"}
                    </p>
                    <p className="text-lg font-bold" style={{ color: acentoLegible }}>
                      $12.500
                    </p>
                  </div>
                </div>
              </div>

              {/* Informativo y no una advertencia ámbar, a propósito: el sistema ya
                  corrigió el color solo y el dueño no tiene nada que hacer. El
                  naranja por defecto contrasta 2,8:1, así que un aviso alarmante
                  aparecería en casi todos los locales sin que nadie haya tocado
                  nada — y una alerta que sale siempre es una alerta que nadie lee. */}
              {acentoNecesitaAjuste && (
                <div className="mt-3 flex gap-2 rounded-xl dash-bg-surface px-3 py-2.5 dash-text-secondary">
                  <span aria-hidden>ℹ</span>
                  <p className="text-[11px] leading-relaxed">
                    Tu color de acento contrasta {contrasteAcento.toFixed(1)}:1 sobre blanco y el
                    mínimo para que un precio se lea es {CONTRASTE_AA}:1. En el menú los precios se
                    van a pintar en{" "}
                    <span className="font-mono font-semibold">{acentoLegible}</span>, el mismo tono
                    un poco más oscuro. No hay nada que corregir: tu marca no cambia.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold dash-text-secondary block mb-1">Logo</label>
              {logoUrl ? (
                <div className="flex items-center gap-3 rounded-xl dash-bg-surface px-3 py-2.5">
                  <Image
                    src={logoUrl}
                    alt="Vista previa del logo"
                    width={64}
                    height={64}
                    unoptimized
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                  <button
                    onClick={() => setLogoUrl("")}
                    className="px-3 py-2 rounded-lg dash-bg-surface dash-text-secondary text-xs font-semibold hover:opacity-80 transition-opacity"
                  >
                    Quitar logo
                  </button>
                </div>
              ) : (
                <label className={`flex items-center justify-center rounded-xl border-2 border-dashed border-stone-700 text-xs text-center py-6 cursor-pointer transition-opacity ${
                  subiendoLogo ? "opacity-60 pointer-events-none" : "hover:opacity-80"
                } dash-text-muted`}>
                  {subiendoLogo ? "Subiendo…" : "Subir logo"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={subiendoLogo}
                    onChange={handleLogoChange}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6">
            {savedMsg && (
              <span className="text-xs font-semibold text-green-400">✓ Cambios guardados</span>
            )}
            <button
              onClick={handleGuardar}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </main>

      {/* Toast de error, discreto y auto-ocultable */}
      {errorMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-red-950/80 border border-red-800/60 text-red-200 text-sm font-medium shadow-lg backdrop-blur-sm">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
