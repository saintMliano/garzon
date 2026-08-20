"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import CarteraSuscripciones from "./cartera-suscripciones";
import SupresionTelefono from "./supresion-telefono";
import { DIAS_GRACIA, DIAS_PRUEBA } from "@/lib/suscripcion";
import { NavPanel } from "@/app/dashboard/nav-panel";
import { useRolLocal } from "@/lib/usar-rol";

type OnboardResult = {
  localId: string;
  nombre: string;
  slug: string;
  email: string;
  tempPassword: string;
  logoUrl: string | null;
  /** Fin de la prueba gratis con que nace todo local nuevo (F10). */
  pruebaHasta: string | null;
  menuUrl: string;
  dashboardUrl: string;
};

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function AdminOnboardPage() {
  // El rol es por local: lo resuelve el hook compartido a partir del local
  // seleccionado. Solo decide qué se dibuja; quien niega es la base.
  const { rol } = useRolLocal();

  const supabase = useMemo(() => createClient(), []);

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [email, setEmail] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(null);

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { data: adminRow } = await supabase
        .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();

      setIsAdmin(!!adminRow);
      setCheckingAdmin(false);
    }
    checkAdmin();
  }, [supabase]);

  // Vista previa del logo: crea/revoca el object URL cuando cambia el archivo.
  useEffect(() => {
    if (!logoFile) { setLogoPreviewUrl(null); return; }
    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  // Oculta el toast de error automáticamente.
  useEffect(() => {
    if (!errorMsg) return;
    const timeout = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(timeout);
  }, [errorMsg]);

  useEffect(() => {
    if (!copiedField) return;
    const timeout = setTimeout(() => setCopiedField(null), 2000);
    return () => clearTimeout(timeout);
  }, [copiedField]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function handleNombreChange(value: string) {
    setNombre(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugEdited(true);
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setLogoFile(file);
  }

  function resetForm() {
    setNombre("");
    setSlug("");
    setSlugEdited(false);
    setEmail("");
    setLogoFile(null);
    setResult(null);
    setErrorMsg(null);
  }

  async function copyToClipboard(text: string, field: "email" | "password") {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
    } catch {
      setErrorMsg("No se pudo copiar; hazlo manualmente.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) {
      setErrorMsg("El nombre y el email del dueño son obligatorios.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const logo = logoFile ? await readFileAsDataUrl(logoFile) : undefined;

      const res = await fetch("/api/admin/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim(),
          slug: slug.trim() || undefined,
          logo,
        }),
      });
      const body = await res.json();

      if (!res.ok || !body.ok) {
        setErrorMsg(body.error || "No se pudo crear el local; reintenta.");
        return;
      }
      setResult(body as OnboardResult);
    } catch {
      setErrorMsg("Error de red; reintenta.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen dashboard-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-4 border-stone-800 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
          </div>
          <p className="text-stone-500 text-sm font-medium">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen dashboard-dark px-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl dash-bg-surface flex items-center justify-center text-2xl">🔒</div>
          <h2 className="font-bold dash-text-primary text-base">No autorizado</h2>
          <p className="text-stone-500 text-sm">Esta sección es solo para super-admins de la plataforma.</p>
          <Link
            href="/dashboard"
            className="mt-2 px-4 py-2 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
          >
            Volver al dashboard
          </Link>
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
              <h1 className="font-bold dash-text-primary text-base">Garzón Digital</h1>
              <p className="text-[11px] dash-text-muted">Garzón Digital · Panel de control</p>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <NavPanel actual="admin" rol={rol} esPlatformAdmin={isAdmin} />

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

      {/* ===== PANEL DE ALTA ===== */}
      <main className="flex-1 p-3 md:p-5">
        <div className="max-w-2xl mx-auto dash-card rounded-2xl border-2 p-5">
          <h2 className="font-bold dash-text-primary text-base mb-4">Dar de alta un local</h2>

          {result ? (
            <div className="space-y-4">
              <div className="rounded-xl dash-bg-surface p-4 space-y-3">
                <div>
                  <p className="text-[11px] dash-text-muted uppercase tracking-wider font-medium">Local creado</p>
                  <p className="font-bold dash-text-primary text-sm">{result.nombre}</p>
                  <p className="text-xs dash-text-muted font-mono">/{result.slug}</p>
                </div>

                <div className="h-px bg-stone-800" />

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] dash-text-muted uppercase tracking-wider font-medium">Email del dueño</p>
                    <p className="font-semibold dash-text-primary text-sm truncate">{result.email}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(result.email, "email")}
                    className="shrink-0 px-3 py-2 rounded-lg dash-bg-surface dash-text-secondary text-xs font-semibold hover:opacity-80 transition-opacity"
                  >
                    {copiedField === "email" ? "✓ Copiado" : "Copiar"}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] dash-text-muted uppercase tracking-wider font-medium">Contraseña temporal</p>
                    <p className="font-semibold dash-text-primary text-sm font-mono truncate">{result.tempPassword}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(result.tempPassword, "password")}
                    className="shrink-0 px-3 py-2 rounded-lg dash-bg-surface dash-text-secondary text-xs font-semibold hover:opacity-80 transition-opacity"
                  >
                    {copiedField === "password" ? "✓ Copiado" : "Copiar"}
                  </button>
                </div>
              </div>

              <p className="text-xs dash-text-muted">
                Entrégale estas credenciales al dueño. Debe cambiar la contraseña en su primer ingreso.
              </p>

              {result.pruebaHasta && (
                <p className="text-xs dash-text-muted">
                  Prueba gratis de {DIAS_PRUEBA} días: recibe pedidos hasta el{" "}
                  <strong className="dash-text-primary">
                    {(() => {
                      const [a, m, d] = result.pruebaHasta.split("-").map(Number);
                      return new Date(a, m - 1, d).toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "long",
                      });
                    })()}
                  </strong>
                  , más {DIAS_GRACIA} días de gracia.
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <a
                  href={result.menuUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
                >
                  Ver menú
                </a>
                <a
                  href={result.dashboardUrl}
                  className="px-4 py-2.5 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
                >
                  Ir al dashboard
                </a>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={resetForm}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.02] active:scale-95 transition-transform"
                >
                  Crear otro
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Nombre del local</label>
                <input
                  value={nombre}
                  onChange={(e) => handleNombreChange(e.target.value)}
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: Completos Lalo"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Slug (opcional)</label>
                <input
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  placeholder="completos-lalo"
                />
                <p className="text-[11px] dash-text-muted mt-1">Se genera del nombre si lo dejas vacío.</p>
              </div>

              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Email del dueño</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="dueno@ejemplo.com"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold dash-text-secondary block mb-1">Logo del local (opcional)</label>
                {logoPreviewUrl ? (
                  <div className="flex items-center gap-3 rounded-xl dash-bg-surface px-3 py-2.5">
                    <Image
                      src={logoPreviewUrl}
                      alt="Vista previa del logo"
                      width={64}
                      height={64}
                      unoptimized
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => setLogoFile(null)}
                      className="px-3 py-2 rounded-lg dash-bg-surface dash-text-secondary text-xs font-semibold hover:opacity-80 transition-opacity"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center rounded-xl border-2 border-dashed border-stone-700 text-xs text-center py-6 cursor-pointer transition-opacity hover:opacity-80 dash-text-muted">
                    Subir logo
                    <input type="file" accept="image/*" hidden onChange={handleLogoChange} />
                  </label>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-60"
                >
                  {submitting ? "Creando…" : "Crear local"}
                </button>
              </div>
            </form>
          )}
        </div>

        <CarteraSuscripciones onError={setErrorMsg} />

        <SupresionTelefono onError={setErrorMsg} />
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
