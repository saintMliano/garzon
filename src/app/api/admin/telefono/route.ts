import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enmascararTelefono, normalizarTelefonoChileno } from "@/lib/telefono";

// ============================================================
// /api/admin/telefono — derecho de supresión (solo super-admin).
//
// Existe para responder una cosa concreta: un comensal pide que borren su
// teléfono y hay que poder hacerlo y demostrarlo.
//
// Lo que este endpoint NO es, y el diseño lo impide a propósito:
//
//   · No es un buscador de clientes. Solo acepta el número COMPLETO y válido;
//     no hay búsqueda parcial, ni por prefijo, ni listados. Sin eso, la misma
//     herramienta serviría para recorrer la base preguntando "quién es este".
//   · No devuelve el contenido de los pedidos ni el nombre del comensal. Para
//     atender una supresión alcanza con saber cuántos hay y en qué local.
//
// SOLO SERVIDOR: usa la service-role key. Ninguna sesión de navegador puede
// leer ni escribir estas columnas ni la bitácora de supresiones.
// ============================================================

/** Verifica sesión + super-admin. Devuelve la respuesta de error, o null si pasa. */
async function exigirSuperAdmin(): Promise<{ error: NextResponse } | { userId: string }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return { error: NextResponse.json({ error: "No autorizado." }, { status: 403 }) };

  return { userId: user.id };
}

const ERROR_NUMERO_INCOMPLETO = "Escribe el número completo: 9 dígitos que parten con 9.";

export async function GET(request: Request) {
  const auth = await exigirSuperAdmin();
  if ("error" in auth) return auth.error;

  const crudo = new URL(request.url).searchParams.get("telefono") ?? "";
  const telefono = normalizarTelefonoChileno(crudo);
  if (!telefono) {
    return NextResponse.json({ error: ERROR_NUMERO_INCOMPLETO }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pedidos")
    .select("local_id, created_at, locales(nombre, slug)")
    .eq("telefono", telefono)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "No se pudo buscar." }, { status: 500 });
  }

  // Se agrupa por local porque el responsable de los datos es CADA local: una
  // supresión normalmente la pide alguien que comió en uno solo.
  const porLocal = new Map<
    string,
    { localId: string; nombre: string; slug: string; pedidos: number; desde: string; hasta: string }
  >();

  for (const fila of data ?? []) {
    const local = fila.locales as unknown as { nombre: string; slug: string } | null;
    const fecha = (fila.created_at ?? "").slice(0, 10);
    const previo = porLocal.get(fila.local_id);
    if (previo) {
      previo.pedidos += 1;
      previo.hasta = fecha;
    } else {
      porLocal.set(fila.local_id, {
        localId: fila.local_id,
        nombre: local?.nombre ?? "(local eliminado)",
        slug: local?.slug ?? "",
        pedidos: 1,
        desde: fecha,
        hasta: fecha,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    telefono,
    enmascarado: enmascararTelefono(telefono),
    total: (data ?? []).length,
    locales: [...porLocal.values()],
  });
}

export async function POST(request: Request) {
  const auth = await exigirSuperAdmin();
  if ("error" in auth) return auth.error;

  let body: { telefono?: string; localId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const telefono = normalizarTelefonoChileno(body.telefono ?? "");
  if (!telefono) {
    return NextResponse.json({ error: ERROR_NUMERO_INCOMPLETO }, { status: 400 });
  }
  const localId = typeof body.localId === "string" && body.localId ? body.localId : null;

  const admin = createAdminClient();

  // Se ANULA el teléfono, no se borra el pedido: la venta es la contabilidad del
  // local y no le pertenece a quien pidió la supresión. Lo que desaparece es el
  // dato personal.
  let q = admin.from("pedidos").update({ telefono: null }).eq("telefono", telefono);
  if (localId) q = q.eq("local_id", localId);

  const { data: afectados, error } = await q.select("id");
  if (error) {
    return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
  }

  const borrados = (afectados ?? []).length;
  const enmascarado = enmascararTelefono(telefono);

  // La constancia va SIN el número: guardarlo entero "para saber a quién le
  // borramos" anularía el borrado, dejando el dato vivo en otra tabla.
  // Se registra aunque `borrados` sea 0: que no hubiera nada que borrar también
  // es parte de la respuesta que se le da a quien reclamó.
  const { error: errLog } = await admin.from("supresiones_telefono").insert({
    local_id: localId,
    telefono_enmascarado: enmascarado,
    pedidos_afectados: borrados,
    actor: auth.userId,
  });
  if (errLog) {
    // El borrado ya ocurrió y es lo importante; si la constancia falla, se avisa
    // en vez de fingir que todo salió bien.
    return NextResponse.json(
      { ok: true, borrados, enmascarado, avisoBitacora: "El borrado se hizo, pero no se pudo registrar la constancia." },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, borrados, enmascarado });
}
