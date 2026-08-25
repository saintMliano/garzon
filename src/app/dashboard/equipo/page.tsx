"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BuildingStorefrontIcon, KeyIcon } from "@heroicons/react/24/outline";
import { NavPanel } from "@/app/dashboard/nav-panel";
import { useConfirmar } from "@/componentes/usar-confirmar";
import { useRolLocal, avisarCambioDeLocal } from "@/lib/usar-rol";
import { DESCRIPCION_ROL, NOMBRE_ROL, ROLES, type Rol } from "@/lib/roles";

/**
 * Equipo del local.
 *
 * Sin esta pantalla los roles existen pero el dueño no puede usarlos: habría
 * que crear cada cuenta por SQL. Es la parte aburrida de la funcionalidad y la
 * que decide si sirve o no.
 *
 * Todo pasa por /api/local/equipo, que es el único camino que puede escribir
 * `local_staff.rol` — la columna no tiene GRANT UPDATE para `authenticated`.
 */

const LARGO_MINIMO_CLAVE = 10;

type Miembro = {
  user_id: string;
  email: string;
  rol: Rol;
  created_at: string;
  es_vos: boolean;
};

export default function EquipoPage() {
  const { cargando: cargandoRol, rol, localId, localNombre, locales, esPlatformAdmin } = useRolLocal();
  const { confirmar, dialogo } = useConfirmar();

  const [equipo, setEquipo] = useState<Miembro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Alta
  const [abrirAlta, setAbrirAlta] = useState(false);
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [rolNuevo, setRolNuevo] = useState<Rol>("personal");
  const [verClave, setVerClave] = useState(false);

  const cargar = useCallback(async (id: string) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/local/equipo?local_id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo leer el equipo.");
      setEquipo(json.equipo ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el equipo.");
      setEquipo([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!localId) return;
    let vigente = true;
    (async () => {
      if (!vigente) return;
      await cargar(localId);
    })();
    return () => {
      vigente = false;
    };
  }, [localId, cargar]);

  function generarClave() {
    // Sin ambigüedades tipográficas: nada de O/0 ni l/1/I. Esta contraseña se
    // dicta en voz alta o se escribe en un papel, no se copia y pega.
    const alfabeto = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setClave(Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join(""));
    setVerClave(true);
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!localId) return;
    setOcupado("alta");
    setError(null);
    setAviso(null);
    try {
      const res = await fetch("/api/local/equipo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local_id: localId, email, password: clave, rol: rolNuevo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo agregar.");

      setAviso(
        json.cuenta_nueva
          ? `Cuenta creada para ${json.email}. Anota la contraseña: no se puede volver a ver.`
          : `${json.email} ya tenía cuenta y quedó sumada al local con su contraseña de siempre.`
      );
      setEmail("");
      setClave("");
      setAbrirAlta(false);
      await cargar(localId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar.");
    } finally {
      setOcupado(null);
    }
  }

  async function cambiarRol(m: Miembro, nuevo: Rol) {
    if (!localId) return;
    setOcupado(m.user_id);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch("/api/local/equipo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local_id: localId, user_id: m.user_id, rol: nuevo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cambiar el rol.");
      await cargar(localId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el rol.");
    } finally {
      setOcupado(null);
    }
  }

  async function sacar(m: Miembro) {
    if (!localId) return;
    // La misma advertencia de siempre, repartida: la pregunta arriba y la
    // consecuencia abajo. El salto de línea doble que pedía `window.confirm()`
    // ya no hace falta: el diálogo separa título y detalle por su cuenta.
    const confirmado = await confirmar({
      titulo: `¿Sacar a ${m.email} de ${localNombre ?? "el local"}?`,
      detalle:
        "Deja de ver los pedidos de inmediato. Su cuenta no se borra: si trabaja " +
        "en otro local, sigue entrando ahí.",
      destructivo: true,
    });
    if (!confirmado) return;

    setOcupado(m.user_id);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(
        `/api/local/equipo?local_id=${encodeURIComponent(localId)}&user_id=${encodeURIComponent(m.user_id)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo sacar a esa persona.");
      setAviso(`${m.email} ya no forma parte del equipo.`);
      await cargar(localId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sacar a esa persona.");
    } finally {
      setOcupado(null);
    }
  }

  const claveCorta = clave.length > 0 && clave.length < LARGO_MINIMO_CLAVE;

  return (
    <div className="flex flex-col min-h-dvh dashboard-dark">
      <header className="dash-header border-b px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {/* Sobre el gradiente naranja el trazo va `stone-900`: es lo que
                devuelve `textoSobre()` para ese fondo. */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <BuildingStorefrontIcon className="w-5 h-5 text-stone-900" aria-hidden="true" />
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
                  {localNombre ?? "Equipo"}
                </h1>
              )}
              <p className="text-xs dash-text-muted">Garzón Digital · Equipo</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 md:gap-3 flex-wrap justify-end min-w-0">
            <Link
              href="/dashboard/cuenta"
              className="w-10 h-10 rounded-xl dash-bg-surface flex items-center justify-center hover:opacity-80 transition-opacity"
              title="Tu cuenta"
              aria-label="Tu cuenta"
            >
              <KeyIcon className="w-5 h-5 dash-text-secondary" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto mt-2.5">
          <NavPanel actual="equipo" rol={rol} esPlatformAdmin={esPlatformAdmin} className="flex" />
        </div>
      </header>

      <main id="contenido" className="flex-1 p-3 md:p-5">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="dash-card rounded-2xl border-2 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold dash-text-primary text-base">Quién trabaja acá</h2>
                <p className="text-xs dash-text-muted mt-1 leading-relaxed max-w-lg">
                  Cada persona entra con su propia cuenta. El rol es de este local: si alguien
                  trabaja en dos, puede ser dueño en uno y personal en el otro.
                </p>
              </div>
              {/* Abre y cierra el formulario, no da de alta a nadie: si fuera
                  primario, con el formulario abierto habría dos naranjas
                  compitiendo y el de abajo es el que crea la cuenta. */}
              <button
                onClick={() => setAbrirAlta((v) => !v)}
                className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold btn-secundario hover:scale-[1.02] active:scale-95 transition-transform"
              >
                {abrirAlta ? "Cancelar" : "Agregar"}
              </button>
            </div>

            {abrirAlta && (
              <form onSubmit={agregar} className="mt-4 space-y-3 border-t border-stone-800 pt-4">
                <div>
                  <label htmlFor="email" className="text-xs font-semibold dash-text-secondary block mb-1">
                    Correo
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="juan@ellalo.cl"
                    required
                    className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <p className="text-xs dash-text-muted mt-1">
                    No hace falta que sea un correo real ni que lo revise: es su nombre de usuario
                    para entrar. No existe &quot;olvidé mi contraseña&quot;, así que si se pierde
                    tenés que darle una nueva vos.
                  </p>
                </div>

                <div>
                  <label htmlFor="clave" className="text-xs font-semibold dash-text-secondary block mb-1">
                    Contraseña
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="clave"
                      type={verClave ? "text" : "password"}
                      value={clave}
                      onChange={(e) => setClave(e.target.value)}
                      autoComplete="new-password"
                      required
                      className="flex-1 rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={generarClave}
                      className="px-3 py-2 rounded-lg dash-bg-surface dash-text-secondary text-xs font-semibold hover:opacity-80 transition-opacity whitespace-nowrap"
                    >
                      Generar
                    </button>
                  </div>
                  {claveCorta && (
                    <p className="text-xs text-amber-400 mt-1">
                      Necesita al menos {LARGO_MINIMO_CLAVE} caracteres.
                    </p>
                  )}
                </div>

                <div>
                  <span className="text-xs font-semibold dash-text-secondary block mb-1.5">Rol</span>
                  <div className="space-y-2">
                    {ROLES.map((r) => (
                      <label
                        key={r}
                        htmlFor={`rol-${r}`}
                        className={`flex gap-3 items-start rounded-xl border-2 p-3 cursor-pointer transition-colors ${
                          rolNuevo === r ? "border-orange-500 bg-orange-500/10" : "border-stone-800"
                        }`}
                      >
                        <input
                          id={`rol-${r}`}
                          type="radio"
                          name="rol"
                          value={r}
                          checked={rolNuevo === r}
                          onChange={() => setRolNuevo(r)}
                          className="mt-0.5 accent-orange-500"
                        />
                        <span>
                          <span className="block text-sm font-semibold dash-text-primary">
                            {NOMBRE_ROL[r]}
                          </span>
                          <span className="block text-xs dash-text-muted leading-relaxed">
                            {DESCRIPCION_ROL[r]}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={ocupado === "alta" || claveCorta}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-bold btn-primario disabled:opacity-50 hover:scale-[1.01] active:scale-95 transition-transform"
                >
                  {ocupado === "alta" ? "Creando…" : "Crear la cuenta"}
                </button>
              </form>
            )}
          </div>

          {/* El alta cierra el formulario al terminar, así que el resultado
              aparece lejos de donde estaba el foco. Sin anunciarlo, quien usa
              lector de pantalla no se entera de que la cuenta se creó —ni de la
              contraseña que hay que anotar— y vuelve a apretar "Agregar".
              El aviso es "polite" (buena noticia, puede esperar el turno); el
              error es `alert` porque interrumpe: nada de lo pedido pasó. */}
          {aviso && (
            <div aria-live="polite" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-xs text-emerald-300 leading-relaxed">{aviso}</p>
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-xs text-red-300 leading-relaxed">{error}</p>
            </div>
          )}

          <div className="dash-card rounded-2xl border-2 divide-y divide-stone-800">
            {cargandoRol || cargando ? (
              <p className="text-xs dash-text-muted p-5">Cargando…</p>
            ) : equipo.length === 0 ? (
              <p className="text-xs dash-text-muted p-5">Todavía no hay nadie más en este local.</p>
            ) : (
              equipo.map((m) => (
                <div key={m.user_id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold dash-text-primary truncate">
                      {m.email}
                      {m.es_vos && <span className="text-2xs dash-text-muted font-normal"> · vos</span>}
                    </p>
                    <p className="text-xs dash-text-muted mt-0.5">{DESCRIPCION_ROL[m.rol]}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={m.rol}
                      disabled={ocupado === m.user_id}
                      onChange={(e) => cambiarRol(m, e.target.value as Rol)}
                      className="rounded-lg dash-bg-surface px-2.5 py-1.5 text-xs font-semibold dash-text-primary outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="dashboard-dark">
                          {NOMBRE_ROL[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => sacar(m)}
                      disabled={ocupado === m.user_id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                    >
                      Sacar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <p className="text-xs dash-text-muted leading-relaxed px-1">
            El local necesita siempre al menos un dueño: si intentás degradar o sacar al último, el
            sistema no te va a dejar. Nombrá a otro primero.
          </p>
        </div>
      </main>

      {dialogo}
    </div>
  );
}
