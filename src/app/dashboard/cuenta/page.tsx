"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Cambiar la contraseña de la propia cuenta.
 *
 * Existía un agujero de coherencia: la tarjeta de alta de locales le dice al
 * dueño "debe cambiar la contraseña en su primer ingreso" y no había ninguna
 * pantalla donde hacerlo. Esta es esa pantalla.
 *
 * Es de la CUENTA, no del local: quien atiende dos locales tiene una sola
 * contraseña. Por eso vive aparte de `/dashboard/config`, que es la identidad
 * visual del local y se confundiría fácil con "la clave del local".
 */

/**
 * Diez, no seis. El mínimo de Supabase es 6, que para la cuenta que administra
 * los pedidos —y, en el caso del super-admin, los datos personales de los
 * comensales— es poco. Una frase de tres palabras pasa este largo sin esfuerzo
 * y se tipea más rápido en una tablet que ocho caracteres raros.
 */
const LARGO_MINIMO = 10;

export default function CuentaPage() {
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [verClaves, setVerClaves] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!vigente) return;
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setEmail(user.email ?? null);
      setCargando(false);
    })();
    return () => { vigente = false; };
  }, [supabase]);

  const cortaDemas = nueva !== "" && nueva.length < LARGO_MINIMO;
  const noCoinciden = confirmacion !== "" && nueva !== confirmacion;
  const puedeGuardar =
    !guardando &&
    actual !== "" &&
    nueva.length >= LARGO_MINIMO &&
    nueva === confirmacion &&
    nueva !== actual;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!puedeGuardar || !email) return;

    setGuardando(true);
    setError(null);

    try {
      // Se exige la contraseña ACTUAL, que Supabase por sí solo no pide. Sin
      // esto, una tablet desbloqueada sobre el mesón de la cocina alcanza para
      // que cualquiera cambie la clave y deje al dueño fuera de su cuenta.
      //
      // La comprobación va en un cliente APARTE, desechable: si la contraseña
      // está mal, el intento fallido no toca la sesión que ya está abierta en
      // esta pestaña.
      const verificador = createClient();
      const { error: errActual } = await verificador.auth.signInWithPassword({
        email,
        password: actual,
      });
      if (errActual) {
        setError("La contraseña actual no es correcta.");
        return;
      }
      // `scope: "local"` NO es un detalle: el `signOut()` por defecto de Supabase
      // es GLOBAL y revoca todas las sesiones del usuario. Sin este parámetro,
      // comprobar la contraseña actual cerraría la sesión de esta pestaña y la
      // de todas las tablets de la cocina. Solo se descarta el cliente de
      // verificación, que es lo único que sobra.
      await verificador.auth.signOut({ scope: "local" });

      const { error: errCambio } = await supabase.auth.updateUser({ password: nueva });
      if (errCambio) {
        setError(errCambio.message || "No se pudo cambiar la contraseña.");
        return;
      }

      // Supabase revoca las DEMÁS sesiones del usuario al cambiar la contraseña.
      // Es lo correcto en seguridad (si alguien la robó, queda fuera), pero en
      // una cocina la misma cuenta suele estar abierta en dos o tres pantallas y
      // todas van a pedir login de nuevo. No se puede evitar desde el cliente,
      // así que la pantalla lo AVISA antes y lo repite después: una tablet que
      // se desloguea sola a mitad de servicio, sin explicación, se lee como que
      // el sistema se cayó.
      setListo(true);
      setActual("");
      setNueva("");
      setConfirmacion("");
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-dvh dashboard-dark">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 border-4 border-stone-800 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh dashboard-dark">
      <header className="dash-header border-b px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-lg shadow-lg shadow-orange-500/20">
              🍔
            </div>
            <div className="min-w-0">
              <h1 className="font-bold dash-text-primary text-base">Tu cuenta</h1>
              <p className="text-[11px] dash-text-muted">Garzón Digital · Panel de control</p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="px-3.5 py-2 rounded-lg text-xs font-semibold dash-text-secondary dash-bg-surface hover:opacity-80 transition-opacity"
          >
            Volver al panel
          </Link>
        </div>
      </header>

      <main className="flex-1 p-3 md:p-5">
        <div className="max-w-md mx-auto dash-card rounded-2xl border-2 p-5">
          <h2 className="font-bold dash-text-primary text-base">Cambiar contraseña</h2>
          <p className="text-[11px] dash-text-muted mt-1 leading-relaxed">
            Es la contraseña de tu cuenta <strong className="dash-text-secondary">{email}</strong>, no
            la de un local. Si atiendes más de uno, es la misma para todos.
          </p>

          {listo ? (
            <div className="mt-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-xs font-semibold text-emerald-300">Contraseña actualizada</p>
                <p className="text-[11px] dash-text-muted mt-1 leading-relaxed">
                  Las demás pantallas donde esta cuenta estaba abierta se cerraron por seguridad.
                  Vuelve a entrar en ellas con la contraseña nueva.
                </p>
              </div>
              <div className="flex gap-2 mt-4">
                <Link
                  href="/dashboard"
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.02] active:scale-95 transition-transform"
                >
                  Volver al panel
                </Link>
                <button
                  onClick={() => setListo(false)}
                  className="px-4 py-2.5 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
                >
                  Cambiarla de nuevo
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="actual" className="text-xs font-semibold dash-text-secondary block mb-1">
                  Contraseña actual
                </label>
                <input
                  id="actual"
                  type={verClaves ? "text" : "password"}
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="nueva" className="text-xs font-semibold dash-text-secondary block mb-1">
                  Contraseña nueva
                </label>
                <input
                  id="nueva"
                  type={verClaves ? "text" : "password"}
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  autoComplete="new-password"
                  aria-describedby="ayuda-nueva"
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <p id="ayuda-nueva" className="text-[11px] mt-1 leading-relaxed">
                  {cortaDemas ? (
                    <span className="text-red-400 font-medium">
                      Muy corta: al menos {LARGO_MINIMO} caracteres.
                    </span>
                  ) : (
                    <span className="dash-text-muted">
                      Al menos {LARGO_MINIMO} caracteres. Tres o cuatro palabras separadas por guiones
                      se escriben más rápido en una tablet y son más difíciles de adivinar que ocho
                      caracteres raros.
                    </span>
                  )}
                </p>
              </div>

              <div>
                <label htmlFor="confirmacion" className="text-xs font-semibold dash-text-secondary block mb-1">
                  Repite la nueva
                </label>
                <input
                  id="confirmacion"
                  type={verClaves ? "text" : "password"}
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                {/* Se pide dos veces por una razón concreta: un error de tipeo en
                    una clave que no se ve deja al dueño fuera de su propio panel. */}
                {noCoinciden && (
                  <p className="text-[11px] text-red-400 font-medium mt-1">Las dos no coinciden.</p>
                )}
              </div>

              {/* El aviso va ANTES del botón, no después del hecho: si la cocina
                  tiene dos tablets abiertas, esto decide si lo hace ahora o
                  entre turnos. */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <p className="text-[11px] text-amber-200 leading-relaxed">
                  Al cambiarla, las demás pantallas donde esta cuenta esté abierta se van a cerrar y
                  habrá que entrar de nuevo. Si estás en pleno servicio, mejor hazlo después.
                </p>
              </div>

              <label className="flex items-center gap-2 text-[11px] dash-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={verClaves}
                  onChange={(e) => setVerClaves(e.target.checked)}
                  className="accent-orange-500"
                />
                Ver lo que escribo
              </label>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={!puedeGuardar}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-40 disabled:hover:scale-100"
                >
                  {guardando ? "Guardando…" : "Cambiar contraseña"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
