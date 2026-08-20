import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esRolValido, type Rol } from "@/lib/roles";

// ============================================================
// /api/local/equipo — el dueño da de alta y de baja a su gente.
//
// SOLO SERVIDOR: usa la service-role key. Va por endpoint y no por consulta
// directa desde el navegador por dos razones:
//   1. Crear una cuenta de Supabase Auth requiere service-role. No hay otra.
//   2. `local_staff.rol` no tiene GRANT UPDATE para `authenticated` (F12), así
//      que este archivo es el ÚNICO camino para escribir un rol. Sin eso, un
//      `personal` se ascendería solo con un UPDATE desde la consola.
//
// A diferencia de /api/admin/*, acá el que manda NO es el super-admin de la
// plataforma sino el dueño DE ESE local. Hay que verificar las dos cosas:
// que tenga sesión, y que sea dueño del local que dice.
// ============================================================

/** Un local siempre tiene que quedar con alguien que lo administre. */
const MINIMO_DUENOS = 1;

const LARGO_MINIMO_CLAVE = 10;

type Contexto = { userId: string; localId: string };

/**
 * Verifica sesión + que sea dueño del local pedido.
 * Devuelve el contexto, o una respuesta de error ya armada.
 */
async function exigirDueno(localId: string | null): Promise<Contexto | NextResponse> {
  if (!localId) {
    return NextResponse.json({ error: "Falta el local." }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Se lee con el cliente del usuario a propósito: si la RLS de `local_staff`
  // no le deja ver su propia fila, no tiene por qué administrar nada.
  const { data: fila } = await supabase
    .from("local_staff")
    .select("rol")
    .eq("user_id", user.id)
    .eq("local_id", localId)
    .maybeSingle();

  if (!fila || fila.rol !== "dueño") {
    // Mismo mensaje para "no sos de este local" y "sos pero no sos dueño": no
    // hay razón para confirmarle a nadie qué locales existen.
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  return { userId: user.id, localId };
}

/** Cuántos dueños quedan en el local, contando de verdad. */
async function contarDuenos(localId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("local_staff")
    .select("user_id", { count: "exact", head: true })
    .eq("local_id", localId)
    .eq("rol", "dueño");
  return count ?? 0;
}

// ------------------------------------------------------------
// GET — quiénes trabajan en el local
// ------------------------------------------------------------
export async function GET(request: Request) {
  const localId = new URL(request.url).searchParams.get("local_id");
  const ctx = await exigirDueno(localId);
  if (ctx instanceof NextResponse) return ctx;

  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("local_staff")
    .select("user_id, rol, created_at")
    .eq("local_id", ctx.localId);

  if (error) {
    return NextResponse.json({ error: "No se pudo leer el equipo." }, { status: 500 });
  }

  // El correo vive en auth.users, que no es consultable por join desde
  // PostgREST. Se resuelve uno por uno con el cliente admin.
  const equipo = await Promise.all(
    (filas ?? []).map(async (f) => {
      const { data } = await admin.auth.admin.getUserById(f.user_id);
      return {
        user_id: f.user_id,
        email: data?.user?.email ?? "(cuenta eliminada)",
        rol: f.rol as Rol,
        created_at: f.created_at,
        es_vos: f.user_id === ctx.userId,
      };
    })
  );

  equipo.sort((a, b) => {
    if (a.rol !== b.rol) return a.rol === "dueño" ? -1 : 1;
    return a.email.localeCompare(b.email);
  });

  return NextResponse.json({ equipo });
}

// ------------------------------------------------------------
// POST — alta de una persona
// ------------------------------------------------------------
export async function POST(request: Request) {
  let cuerpo: { local_id?: string; email?: string; password?: string; rol?: string };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const ctx = await exigirDueno(cuerpo.local_id ?? null);
  if (ctx instanceof NextResponse) return ctx;

  const email = (cuerpo.email ?? "").trim().toLowerCase();
  const password = cuerpo.password ?? "";
  const rol = cuerpo.rol;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "El correo no es válido." }, { status: 400 });
  }
  if (password.length < LARGO_MINIMO_CLAVE) {
    return NextResponse.json(
      { error: `La contraseña necesita al menos ${LARGO_MINIMO_CLAVE} caracteres.` },
      { status: 400 }
    );
  }
  if (!esRolValido(rol)) {
    return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Si la cuenta ya existe (la persona trabaja en otro local, o es el dueño de
  // otro), no se crea de nuevo: se vincula. La contraseña enviada se ignora en
  // ese caso — no se le puede cambiar la clave a alguien desde acá.
  const { data: listado } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existente = (listado?.users ?? []).find((u) => u.email?.toLowerCase() === email);

  let userId: string;
  let cuentaNueva = false;

  if (existente) {
    userId = existente.id;
  } else {
    // `email_confirm: true` porque no hay SMTP confiable en el plan gratis y no
    // existe el flujo de "confirmá tu correo". Mismo criterio que el onboarding.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: `No se pudo crear la cuenta: ${error?.message ?? "error desconocido"}` },
        { status: 500 }
      );
    }
    userId = data.user.id;
    cuentaNueva = true;
  }

  const { error: errVinculo } = await admin
    .from("local_staff")
    .insert({ user_id: userId, local_id: ctx.localId, rol });

  if (errVinculo) {
    // Rollback solo de lo que creamos nosotros: si la cuenta ya existía, es de
    // la persona y borrarla sería sacarla de sus otros locales.
    if (cuentaNueva) await admin.auth.admin.deleteUser(userId);
    const yaEstaba = errVinculo.code === "23505";
    return NextResponse.json(
      { error: yaEstaba ? "Esa persona ya está en el equipo." : "No se pudo vincular la cuenta." },
      { status: yaEstaba ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, user_id: userId, email, rol, cuenta_nueva: cuentaNueva });
}

// ------------------------------------------------------------
// PATCH — cambiar el rol de alguien
// ------------------------------------------------------------
export async function PATCH(request: Request) {
  let cuerpo: { local_id?: string; user_id?: string; rol?: string };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const ctx = await exigirDueno(cuerpo.local_id ?? null);
  if (ctx instanceof NextResponse) return ctx;

  const objetivo = cuerpo.user_id;
  const rol = cuerpo.rol;
  if (!objetivo || !esRolValido(rol)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: actual } = await admin
    .from("local_staff")
    .select("rol")
    .eq("user_id", objetivo)
    .eq("local_id", ctx.localId)
    .maybeSingle();

  if (!actual) {
    return NextResponse.json({ error: "Esa persona no está en el equipo." }, { status: 404 });
  }
  if (actual.rol === rol) {
    return NextResponse.json({ ok: true, sin_cambios: true });
  }

  // El local no puede quedarse sin nadie que lo administre. Pasa sobre todo con
  // el dueño degradándose a sí mismo, que después solo se arregla por SQL.
  if (actual.rol === "dueño" && (await contarDuenos(ctx.localId)) <= MINIMO_DUENOS) {
    return NextResponse.json(
      { error: "El local necesita al menos un dueño. Nombrá a otro antes de cambiar este." },
      { status: 409 }
    );
  }

  const { error } = await admin
    .from("local_staff")
    .update({ rol })
    .eq("user_id", objetivo)
    .eq("local_id", ctx.localId);

  if (error) {
    return NextResponse.json({ error: "No se pudo cambiar el rol." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// ------------------------------------------------------------
// DELETE — sacar a alguien del local
// ------------------------------------------------------------
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const localId = url.searchParams.get("local_id");
  const objetivo = url.searchParams.get("user_id");

  const ctx = await exigirDueno(localId);
  if (ctx instanceof NextResponse) return ctx;

  if (!objetivo) {
    return NextResponse.json({ error: "Falta la persona." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: actual } = await admin
    .from("local_staff")
    .select("rol")
    .eq("user_id", objetivo)
    .eq("local_id", ctx.localId)
    .maybeSingle();

  if (!actual) {
    return NextResponse.json({ error: "Esa persona no está en el equipo." }, { status: 404 });
  }
  if (actual.rol === "dueño" && (await contarDuenos(ctx.localId)) <= MINIMO_DUENOS) {
    return NextResponse.json(
      { error: "Es el único dueño del local. Nombrá a otro antes de sacarlo." },
      { status: 409 }
    );
  }

  const { error } = await admin
    .from("local_staff")
    .delete()
    .eq("user_id", objetivo)
    .eq("local_id", ctx.localId);

  if (error) {
    return NextResponse.json({ error: "No se pudo sacar a esa persona." }, { status: 500 });
  }

  // La cuenta de Auth NO se borra: la persona puede trabajar en otro local, y
  // borrarla la dejaría afuera de todos. Sin la fila de `local_staff` la RLS ya
  // no le devuelve un solo dato de este local.
  //
  // El JWT que tenga en la mano sigue siendo válido hasta que expire, pero sin
  // filas que leer no le sirve de nada. Si hubiera que cortar en el acto, acá
  // iría un `admin.auth.admin.signOut(objetivo)`.
  return NextResponse.json({ ok: true });
}
