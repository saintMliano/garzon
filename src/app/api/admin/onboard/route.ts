import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DIAS_PRUEBA } from "@/lib/suscripcion";

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// ============================================================
// POST /api/admin/onboard  — Alta de un local nuevo (solo super-admin).
// Crea: cuenta del dueño (auth) + registro en `locales` + vínculo en
// `local_staff` + semilla mínima de categorías. Devuelve las credenciales.
// SOLO SERVIDOR: usa la service-role key vía createAdminClient().
// ============================================================

const PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generarPassword(len = 12): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += PW_CHARS[bytes[i] % PW_CHARS.length];
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(request: Request) {
  // 1. Autenticación: debe haber sesión.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // 2. Autorización: el usuario debe ser super-admin de la plataforma.
  //    (La política RLS "read own admin row" permite leer solo la propia fila.)
  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // 3. Validación de entrada.
  let body: { nombre?: string; slug?: string; email?: string; logo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const nombre = (body.nombre ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const slug = slugify(body.slug || nombre);
  if (!nombre || !email || !slug) {
    return NextResponse.json(
      { error: "Faltan datos: nombre, email y slug son obligatorios." },
      { status: 400 }
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  // 4. Operaciones privilegiadas con la service-role key.
  const admin = createAdminClient();

  // 4a. Slug único.
  const { data: slugTaken } = await admin
    .from("locales")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugTaken) {
    return NextResponse.json(
      { error: `El slug "${slug}" ya está en uso.` },
      { status: 409 }
    );
  }

  // 4b. Crear la cuenta del dueño.
  const tempPassword = generarPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    const msg = (createErr?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return NextResponse.json(
        { error: "Ese email ya tiene una cuenta." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "No se pudo crear la cuenta del dueño." },
      { status: 500 }
    );
  }
  const ownerId = created.user.id;

  // 4c. Crear el local, con la prueba ya corriendo (F10). Se fija acá y no por
  //     default de la columna para que la fecha se cuente en días de Chile, que
  //     es como se la vamos a contar al cliente.
  //
  //     Siete días: una semana completa, con su fin de semana, que es el ciclo
  //     real de un local de comida. Sumados los 7 de gracia, la exposición
  //     máxima sin cobrar es de 14 días.
  const hoyChile = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const finPrueba = (() => {
    const [a, m, d] = hoyChile.split("-").map(Number);
    const base = new Date(Date.UTC(a, m - 1, d));
    base.setUTCDate(base.getUTCDate() + DIAS_PRUEBA);
    return base.toISOString().slice(0, 10);
  })();

  const { data: local, error: localErr } = await admin
    .from("locales")
    .insert({
      nombre,
      slug,
      activo: true,
      suscripcion_estado: "prueba",
      suscripcion_hasta: finPrueba,
    })
    .select()
    .single();
  if (localErr || !local) {
    await admin.auth.admin.deleteUser(ownerId); // rollback
    return NextResponse.json(
      { error: "No se pudo crear el local." },
      { status: 500 }
    );
  }

  // 4d. Vincular al dueño con su local.
  const { error: staffErr } = await admin
    .from("local_staff")
    .insert({ user_id: ownerId, local_id: local.id });
  if (staffErr) {
    await admin.from("locales").delete().eq("id", local.id); // rollback
    await admin.auth.admin.deleteUser(ownerId);
    return NextResponse.json(
      { error: "No se pudo vincular el dueño con el local." },
      { status: 500 }
    );
  }

  // 4e. Semilla mínima (categorías de ejemplo; el menú completo se carga aparte).
  await admin.from("categorias").insert([
    { local_id: local.id, nombre: "Platos", icono: "🍽️", orden: 1 },
    { local_id: local.id, nombre: "Bebidas", icono: "🥤", orden: 2 },
  ]);

  // 4f. Logo (opcional): se sube server-side con la service-role key, porque
  //     el super-admin no es staff del local nuevo y la RLS de Storage lo
  //     bloquearía desde el cliente. Best-effort: si falla, el alta igual sigue.
  let logoUrl: string | null = null;
  const logo = typeof body.logo === "string" ? body.logo : null;
  const match = logo?.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    const mime = match[1];
    const ext = MIME_EXT[mime] ?? "png";
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 0 && buffer.length <= 3 * 1024 * 1024) {
      const path = `${local.id}/logo-${randomUUID()}.${ext}`;
      const { error: upErr } = await admin.storage
        .from("menu")
        .upload(path, buffer, { contentType: mime, upsert: true });
      if (!upErr) {
        logoUrl = admin.storage.from("menu").getPublicUrl(path).data.publicUrl;
        await admin.from("locales").update({ logo_url: logoUrl }).eq("id", local.id);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    localId: local.id,
    nombre,
    slug,
    email,
    tempPassword,
    logoUrl,
    pruebaHasta: finPrueba,
    menuUrl: `/local/${slug}`,
    dashboardUrl: "/dashboard",
  });
}
