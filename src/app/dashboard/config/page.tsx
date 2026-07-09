"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { Local } from "@/types/database";

export default function ConfigPage() {
  const supabase = useMemo(() => createClient(), []);

  const [localId, setLocalId] = useState<string | null>(null);
  const [localNombre, setLocalNombre] = useState("");
  const [resolvingLocal, setResolvingLocal] = useState(true);
  const [noLocal, setNoLocal] = useState(false);

  const [nombre, setNombre] = useState("");
  const [slogan, setSlogan] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [colorPrimario, setColorPrimario] = useState("#f97316");
  const [logoUrl, setLogoUrl] = useState("");

  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function resolveLocal() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setResolvingLocal(false); setNoLocal(true); return; }

      const { data: staff } = await supabase
        .from("local_staff").select("local_id").eq("user_id", user.id).limit(1).maybeSingle();

      if (!staff) { setResolvingLocal(false); setNoLocal(true); return; }

      const { data: local } = await supabase
        .from("locales").select("*").eq("id", staff.local_id).single();

      setLocalId(staff.local_id);
      if (local) {
        const l = local as Local;
        setLocalNombre(l.nombre ?? "");
        setNombre(l.nombre ?? "");
        setSlogan(l.slogan ?? "");
        setDireccion(l.direccion ?? "");
        setTelefono(l.telefono ?? "");
        setColorPrimario(l.color_primario ?? "#f97316");
        setLogoUrl(l.logo_url ?? "");
      }
      setResolvingLocal(false);
    }
    resolveLocal();
  }, [supabase]);

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
              <h1 className="font-bold dash-text-primary text-base">{localNombre || "Garzón Digital"}</h1>
              <p className="text-[11px] dash-text-muted">Garzón Digital · Panel de control</p>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <nav className="flex items-center gap-1 dash-bg-surface rounded-xl p-1">
              <Link
                href="/dashboard"
                className="px-3 py-2 rounded-lg text-xs font-semibold dash-text-secondary hover:opacity-80 transition-opacity"
              >
                Pedidos
              </Link>
              <Link
                href="/dashboard/menu"
                className="px-3 py-2 rounded-lg text-xs font-semibold dash-text-secondary hover:opacity-80 transition-opacity"
              >
                Menú
              </Link>
              <span className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500">
                Identidad
              </span>
            </nav>

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
                  value={colorPrimario}
                  onChange={(e) => setColorPrimario(e.target.value)}
                  className="w-11 h-10 rounded-lg dash-bg-surface cursor-pointer border-0 p-1"
                />
                <input
                  value={colorPrimario}
                  onChange={(e) => setColorPrimario(e.target.value)}
                  className="flex-1 rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  placeholder="#f97316"
                  maxLength={7}
                />
                <div
                  className="w-10 h-10 rounded-lg shrink-0 border border-stone-700"
                  style={{ backgroundColor: colorPrimario }}
                  title="Vista previa"
                />
              </div>
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
