"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmar } from "@/componentes/usar-confirmar";
import { DIAS_GRACIA, DIAS_PRUEBA } from "@/lib/suscripcion";

/**
 * Cartera de suscripciones (solo super-admin).
 *
 * La plata no pasa por la plataforma: acá no se cobra nada, se registra hasta
 * cuándo cada local está al día después de que pagó por transferencia.
 *
 * Todo pasa por `/api/admin/suscripcion`, que es server-only: las columnas de
 * suscripción no tienen permiso de escritura para ninguna sesión del navegador.
 */

type LocalSuscripcion = {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean | null;
  plan: string;
  suscripcion_estado: string;
  suscripcion_hasta: string | null;
  suscripcion_notas: string | null;
  situacion: string;
};

type Accion = "renovar_mes" | "renovar_anio" | "prueba" | "cortesia" | "cancelar";

const ETIQUETA: Record<string, { texto: string; clase: string }> = {
  cortesia: { texto: "Cortesía", clase: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  al_dia: { texto: "Al día", clase: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  por_vencer: { texto: "Por vencer", clase: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  gracia: { texto: "En gracia", clase: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  pausada: { texto: "Pausada", clase: "bg-red-500/15 text-red-300 border-red-500/30" },
};

function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function CarteraSuscripciones({
  onError,
}: {
  onError: (mensaje: string) => void;
}) {
  const [locales, setLocales] = useState<LocalSuscripcion[] | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmar();

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/suscripcion");
      const body = await res.json();
      if (!res.ok || !body.ok) {
        onError(body.error || "No se pudo cargar la cartera.");
        return;
      }
      setLocales(body.locales as LocalSuscripcion[]);
    } catch {
      onError("Error de red al cargar la cartera.");
    }
  }, [onError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(local: LocalSuscripcion, accion: Accion) {
    // Cancelar es la única que quita el servicio de golpe: se confirma.
    if (accion === "cancelar") {
      // La misma advertencia de siempre, repartida: la pregunta arriba y la
      // consecuencia abajo. El botón dice "Sí, cancelar" y no el "Confirmar" por
      // omisión porque acá "Cancelar" a secas nombraría las dos cosas opuestas:
      // la acción que se pide y el arrepentirse de pedirla.
      const ok = await confirmar({
        titulo: `¿Cancelar la suscripción de ${local.nombre}?`,
        detalle: "Los pedidos por QR se pausan de inmediato.",
        aceptar: "Sí, cancelar",
        destructivo: true,
      });
      if (!ok) return;
    }

    setTrabajando(local.id);
    try {
      const res = await fetch("/api/admin/suscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localId: local.id, accion }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        onError(body.error || "No se pudo actualizar la suscripción.");
        return;
      }
      setLocales((prev) =>
        (prev ?? []).map((l) => (l.id === local.id ? { ...l, ...body.local } : l))
      );
    } catch {
      onError("Error de red al actualizar.");
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto dash-card rounded-2xl border-2 p-5 mt-4">
      <h2 className="font-bold dash-text-primary text-base">Suscripciones</h2>
      <p className="text-xs dash-text-muted mt-1">
        El local paga por fuera; acá se registra hasta cuándo está al día. Tras vencer hay{" "}
        {DIAS_GRACIA} días de gracia antes de que se pausen los pedidos.
      </p>

      {locales === null ? (
        <p className="text-xs dash-text-muted mt-4">Cargando…</p>
      ) : locales.length === 0 ? (
        <p className="text-xs dash-text-muted mt-4">Todavía no hay locales.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {locales.map((l) => {
            const etiqueta = ETIQUETA[l.situacion] ?? {
              texto: l.situacion,
              clase: "bg-stone-500/15 text-stone-300 border-stone-500/30",
            };
            const ocupado = trabajando === l.id;

            return (
              /* Acá no hay cartel de "listo": la confirmación de que la acción
                 llegó es la tarjeta misma cambiando de etiqueta y de fecha. Por
                 eso la región viva va en la tarjeta y no en la lista entera —
                 así no se releen los otros locales cada vez que se toca uno. */
              <div key={l.id} aria-live="polite" className="rounded-xl dash-bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold dash-text-primary text-sm truncate">{l.nombre}</p>
                    <p className="text-2xs dash-text-muted font-mono truncate">/{l.slug}</p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-1 rounded-lg border text-2xs font-bold ${etiqueta.clase}`}
                  >
                    {etiqueta.texto}
                  </span>
                </div>

                <p className="text-xs dash-text-muted mt-2">
                  {l.suscripcion_estado === "cortesia"
                    ? "Sin vencimiento"
                    : `Vence el ${formatearFecha(l.suscripcion_hasta)}`}
                  {" · "}
                  plan {l.plan}
                </p>

                <div className="flex flex-wrap gap-2 mt-3">
                  {(
                    [
                      ["renovar_mes", "+1 mes"],
                      ["renovar_anio", "+1 año"],
                      ["prueba", `Prueba ${DIAS_PRUEBA} días`],
                      ["cortesia", "Cortesía"],
                      ["cancelar", "Cancelar"],
                    ] as [Accion, string][]
                  ).map(([accion, texto]) => (
                    <button
                      key={accion}
                      onClick={() => ejecutar(l, accion)}
                      disabled={ocupado}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40 ${
                        accion === "cancelar"
                          ? "bg-red-500/15 text-red-300 border border-red-500/30 hover:opacity-80"
                          : "dash-card dash-text-secondary hover:opacity-80"
                      }`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogo}
    </div>
  );
}
