import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// /api/admin/suscripcion — cartera de suscripciones (solo super-admin).
//
// La plata NO pasa por la plataforma: el local paga por transferencia y acá se
// registra hasta cuándo está al día. No hay pasarela, no hay boletas.
//
// SOLO SERVIDOR: usa la service-role key. Va por endpoint y no por consulta
// directa desde el navegador por dos razones que se refuerzan:
//   1. La RLS de `locales` exige fila en `local_staff`, y el super-admin no es
//      staff de los locales de sus clientes: desde el cliente vería una lista
//      vacía.
//   2. `suscripcion_*` no tiene GRANT UPDATE para `authenticated` (F10), así que
//      ni el dueño de un local ni nadie con una sesión puede prorrogarse solo.
//      El único camino para escribir esas columnas es este archivo.
// ============================================================

type Accion = "renovar_mes" | "renovar_anio" | "prueba_30" | "cortesia" | "cancelar";

/** Hoy en Chile, como 'YYYY-MM-DD'. La suscripción se cuenta en días locales. */
function hoyChile(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCMonth(base.getUTCMonth() + meses);
  return base.toISOString().slice(0, 10);
}

/** Verifica sesión + super-admin. Devuelve la respuesta de error, o null si pasa. */
async function exigirSuperAdmin(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  return null;
}

export async function GET() {
  const denegado = await exigirSuperAdmin();
  if (denegado) return denegado;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("locales")
    .select("id, nombre, slug, activo, plan, suscripcion_estado, suscripcion_hasta, suscripcion_notas")
    .order("nombre");
  if (error) {
    return NextResponse.json({ error: "No se pudo leer la cartera." }, { status: 500 });
  }

  // La situación efectiva la resuelve Postgres para que la pantalla del
  // super-admin no reimplemente la regla y termine mostrando "al día" sobre un
  // local que el servidor ya está rechazando.
  const locales = await Promise.all(
    (data ?? []).map(async (l) => {
      const { data: situacion } = await admin.rpc("situacion_suscripcion", {
        p_estado: l.suscripcion_estado,
        p_hasta: l.suscripcion_hasta,
      });
      return { ...l, situacion: situacion ?? "desconocida" };
    })
  );

  return NextResponse.json({ ok: true, hoy: hoyChile(), locales });
}

export async function POST(request: Request) {
  const denegado = await exigirSuperAdmin();
  if (denegado) return denegado;

  let body: { localId?: string; accion?: Accion; notas?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const localId = (body.localId ?? "").trim();
  const accion = body.accion;
  if (!localId || !accion) {
    return NextResponse.json({ error: "Faltan datos: localId y accion." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: local, error: errLocal } = await admin
    .from("locales")
    .select("id, nombre, suscripcion_estado, suscripcion_hasta")
    .eq("id", localId)
    .maybeSingle();
  if (errLocal || !local) {
    return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
  }

  const hoy = hoyChile();

  // Renovar extiende desde el vencimiento anterior si todavía no pasó, y desde
  // hoy si ya pasó. Así el que paga puntual no pierde los días que le quedaban,
  // y el que paga con atraso no arrastra un vencimiento viejo para siempre.
  const desde =
    local.suscripcion_hasta && local.suscripcion_hasta > hoy ? local.suscripcion_hasta : hoy;

  let cambios: { suscripcion_estado: string; suscripcion_hasta: string | null };
  switch (accion) {
    case "renovar_mes":
      cambios = { suscripcion_estado: "activa", suscripcion_hasta: sumarMeses(desde, 1) };
      break;
    case "renovar_anio":
      cambios = { suscripcion_estado: "activa", suscripcion_hasta: sumarMeses(desde, 12) };
      break;
    case "prueba_30":
      cambios = { suscripcion_estado: "prueba", suscripcion_hasta: sumarDias(hoy, 30) };
      break;
    case "cortesia":
      // Sin vencimiento: el demo y los pilotos regalados no se pausan nunca.
      cambios = { suscripcion_estado: "cortesia", suscripcion_hasta: null };
      break;
    case "cancelar":
      cambios = { suscripcion_estado: "cancelada", suscripcion_hasta: local.suscripcion_hasta };
      break;
    default:
      return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  }

  const payload: Record<string, unknown> = { ...cambios };
  if (typeof body.notas === "string") payload.suscripcion_notas = body.notas.slice(0, 500);

  const { data: actualizado, error: errUpdate } = await admin
    .from("locales")
    .update(payload)
    .eq("id", localId)
    .select("id, nombre, slug, activo, plan, suscripcion_estado, suscripcion_hasta, suscripcion_notas")
    .single();
  if (errUpdate || !actualizado) {
    return NextResponse.json({ error: "No se pudo actualizar la suscripción." }, { status: 500 });
  }

  const { data: situacion } = await admin.rpc("situacion_suscripcion", {
    p_estado: actualizado.suscripcion_estado,
    p_hasta: actualizado.suscripcion_hasta,
  });

  return NextResponse.json({ ok: true, local: { ...actualizado, situacion: situacion ?? "desconocida" } });
}
