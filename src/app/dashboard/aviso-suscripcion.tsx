"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DIAS_GRACIA } from "@/lib/suscripcion";

/**
 * Aviso de suscripción en el dashboard.
 *
 * Escalona igual que la regla del servidor (`situacion_suscripcion`):
 *   por_vencer → aviso tranquilo, hasta 7 días antes
 *   gracia     → ya venció, quedan días antes de que se corte
 *   pausada    → no entran pedidos nuevos
 *
 * Lo que NUNCA hace: bloquear la pantalla. El historial, los pedidos del día y
 * los reportes son datos del local, no una función que se le arrienda. Si su
 * cuenta está vencida deja de vender por la carta digital, pero no pierde el
 * acceso a lo suyo.
 *
 * Los datos salen de `estado_suscripcion`, que es SECURITY INVOKER: la RLS deja
 * que cada local vea solo el suyo.
 */

type Estado = {
  situacion: string;
  hasta: string | null;
  dias_restantes: number | null;
};

function formatearFecha(iso: string): string {
  // `iso` es una fecha sin hora; partirla a mano evita que el navegador la
  // interprete como UTC y muestre el día anterior.
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
  });
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

export default function AvisoSuscripcion({ localId }: { localId: string | null }) {
  const supabase = useMemo(() => createClient(), []);

  // Se guarda junto al local al que pertenece. Así cambiar de local en el
  // selector no deja el aviso del local anterior colgado en pantalla, y no hace
  // falta limpiar el estado dentro del efecto.
  const [cache, setCache] = useState<{ localId: string; estado: Estado | null } | null>(null);

  useEffect(() => {
    if (!localId) return;
    let vigente = true;
    (async () => {
      const { data, error } = await supabase.rpc("estado_suscripcion", { p_local_id: localId });
      // Un fallo acá no debe ensuciar la pantalla de la cocina con una alarma
      // que quizá no corresponde: se calla y el corte real sigue estando en el
      // servidor.
      if (!vigente || error) return;
      setCache({ localId, estado: (data?.[0] as Estado) ?? null });
    })();
    return () => { vigente = false; };
  }, [supabase, localId]);

  const estado = cache && cache.localId === localId ? cache.estado : null;
  if (!estado) return null;

  const { situacion, hasta, dias_restantes } = estado;
  if (situacion === "cortesia" || situacion === "al_dia") return null;

  const dias = dias_restantes ?? 0;

  let tono: string;
  let titulo: string;
  let detalle: string;

  if (situacion === "por_vencer") {
    tono = "border-amber-500/40 bg-amber-500/10 text-amber-200";
    titulo =
      dias === 0
        ? "Tu suscripción vence hoy"
        : `Tu suscripción vence en ${plural(dias, "día", "días")}`;
    detalle = hasta
      ? `Al día hasta el ${formatearFecha(hasta)}. Renová para seguir recibiendo pedidos.`
      : "Renová para seguir recibiendo pedidos.";
  } else if (situacion === "gracia") {
    // `dias` es negativo cuando ya venció. El servidor pausa recién cuando
    // pasaron MÁS de 7 días, así que el día 7 todavía se recibe: por eso el +1.
    const restantes = DIAS_GRACIA + dias + 1;
    tono = "border-orange-500/50 bg-orange-500/15 text-orange-100";
    titulo = hasta ? `Tu suscripción venció el ${formatearFecha(hasta)}` : "Tu suscripción venció";
    detalle =
      restantes > 1
        ? `Seguís recibiendo pedidos ${plural(restantes, "día", "días")} más. Después la carta queda en pausa.`
        : "Hoy es el último día antes de que la carta quede en pausa.";
  } else {
    tono = "border-red-500/50 bg-red-500/15 text-red-100";
    titulo = "Los pedidos por QR están en pausa";
    detalle =
      "Tu carta se sigue viendo, pero no entran pedidos nuevos. Escribinos y la reactivamos.";
  }

  return (
    <div className="px-4 md:px-6 pt-3">
      <div className={`max-w-[1600px] mx-auto rounded-xl border px-4 py-3 ${tono}`}>
        <p className="text-[13px] font-bold">{titulo}</p>
        <p className="text-[12px] opacity-90 mt-0.5">{detalle}</p>
        <p className="text-[12px] opacity-90 mt-1">
          Tus pedidos, tu historial y tus reportes siguen disponibles siempre.
        </p>
      </div>
    </div>
  );
}
