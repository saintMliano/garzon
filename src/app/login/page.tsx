"use client";

import { useState } from "react";
import { BuildingStorefrontIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("Email o contraseña incorrectos");
      setSubmitting(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 dashboard-dark">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* Sobre el gradiente naranja el trazo va `stone-900`: es lo que
              devuelve `textoSobre()` para ese fondo. */}
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
            <BuildingStorefrontIcon className="w-7 h-7 text-stone-900" aria-hidden="true" />
          </div>
          <h1 className="font-bold dash-text-primary text-lg">Garzón Digital · Cocina</h1>
          <p className="text-sm dash-text-muted mt-1">Inicia sesión para ver el panel de pedidos</p>
        </div>

        <form onSubmit={handleSubmit} className="dash-card rounded-2xl border-2 p-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-semibold dash-text-secondary mb-1.5">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cocina@tulocal.cl"
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl dash-bg-surface border border-stone-700 dash-text-primary placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all text-base"
            />
          </div>

          <div>
            <label htmlFor="login-clave" className="block text-sm font-semibold dash-text-secondary mb-1.5">Contraseña</label>
            <input
              id="login-clave"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 rounded-xl dash-bg-surface border border-stone-700 dash-text-primary placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all text-base"
            />
          </div>

          {/* El error aparece abajo del formulario, lejos del foco: sin role="alert"
              quien usa lector de pantalla aprieta "Ingresar", no pasa nada y nunca
              se entera de que la clave estaba mal. */}
          {error && (
            <div role="alert" className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 py-2.5 px-3 rounded-xl border border-red-500/20">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-[50px] rounded-xl btn-primario font-bold shadow-lg shadow-orange-500/20 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-base"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Ingresando...
              </span>
            ) : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
