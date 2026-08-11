/**
 * Limpieza de datos de prueba huérfanos (locales `test-local-*` y usuarios
 * `*@test.garzon`) que quedaron en la base cuando `cleanupTestFixtures` falló
 * en silencio.
 *
 * Uso:
 *   node scripts/limpiar-datos-test.mjs          # dry-run: solo lista
 *   node scripts/limpiar-datos-test.mjs --borrar # ejecuta el borrado
 *
 * Solo toca filas cuyo slug empieza con `test-local-` o cuyo email termina en
 * `@test.garzon`. Nunca toca locales reales.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// quiet: el banner de dotenv iría a stdout y se colaría dentro de los
// archivos generados por redirección (p. ej. `db:types > supabase.ts`).
dotenv.config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const PREFIJO_SLUG = "test-local-";
const DOMINIO_EMAIL = "@test.garzon";
const ejecutar = process.argv.includes("--borrar");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // ---- 1. Inventario ----
  const { data: locales, error: errLocales } = await admin
    .from("locales")
    .select("id, nombre, slug")
    .like("slug", `${PREFIJO_SLUG}%`);
  if (errLocales) throw new Error(`No se pudo listar locales: ${errLocales.message}`);

  const localIds = (locales ?? []).map((l) => l.id);

  const { data: pedidos } = localIds.length
    ? await admin.from("pedidos").select("id").in("local_id", localIds)
    : { data: [] };
  const { data: productos } = localIds.length
    ? await admin.from("productos").select("id").in("local_id", localIds)
    : { data: [] };
  const { data: categorias } = localIds.length
    ? await admin.from("categorias").select("id").in("local_id", localIds)
    : { data: [] };
  const { data: staff } = localIds.length
    ? await admin.from("local_staff").select("user_id").in("local_id", localIds)
    : { data: [] };

  const { data: usersPage, error: errUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (errUsers) throw new Error(`No se pudo listar usuarios: ${errUsers.message}`);
  const usuariosTest = (usersPage?.users ?? []).filter((u) =>
    (u.email ?? "").endsWith(DOMINIO_EMAIL)
  );

  console.log("=== Datos de prueba encontrados ===");
  console.log(`Locales:    ${locales?.length ?? 0}`);
  for (const l of locales ?? []) console.log(`  - ${l.slug}`);
  console.log(`Pedidos:    ${pedidos?.length ?? 0}`);
  console.log(`Productos:  ${productos?.length ?? 0}`);
  console.log(`Categorías: ${categorias?.length ?? 0}`);
  console.log(`Vínculos local_staff: ${staff?.length ?? 0}`);
  console.log(`Usuarios ${DOMINIO_EMAIL}: ${usuariosTest.length}`);
  for (const u of usuariosTest) console.log(`  - ${u.email}`);

  if (!ejecutar) {
    console.log("\n(dry-run) Nada fue borrado. Volvé a correr con --borrar para ejecutar.");
    return;
  }

  if (!localIds.length && !usuariosTest.length) {
    console.log("\nNo hay nada que borrar.");
    return;
  }

  // ---- 2. Borrado en orden de dependencias ----
  console.log("\n=== Borrando ===");
  const fallos = [];
  async function paso(nombre, fn) {
    const { error } = (await fn()) ?? {};
    if (error) {
      fallos.push(`${nombre}: ${error.message}`);
      console.error(`  ✗ ${nombre} — ${error.message}`);
    } else {
      console.log(`  ✓ ${nombre}`);
    }
  }

  if (localIds.length) {
    const pedidoIds = (pedidos ?? []).map((p) => p.id);
    if (pedidoIds.length) {
      await paso("pedido_items", () =>
        admin.from("pedido_items").delete().in("pedido_id", pedidoIds)
      );
      await paso("pedidos", () => admin.from("pedidos").delete().in("id", pedidoIds));
    }
    await paso("productos", () => admin.from("productos").delete().in("local_id", localIds));
    await paso("categorias", () => admin.from("categorias").delete().in("local_id", localIds));
    await paso("local_staff", () => admin.from("local_staff").delete().in("local_id", localIds));
    await paso("locales", () => admin.from("locales").delete().in("id", localIds));
  }

  for (const u of usuariosTest) {
    await paso(`usuario ${u.email}`, async () => await admin.auth.admin.deleteUser(u.id));
  }

  // ---- 3. Verificación ----
  const { data: quedan } = await admin
    .from("locales")
    .select("slug")
    .like("slug", `${PREFIJO_SLUG}%`);
  const { data: usersDespues } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const quedanUsuarios = (usersDespues?.users ?? []).filter((u) =>
    (u.email ?? "").endsWith(DOMINIO_EMAIL)
  );

  console.log("\n=== Verificación ===");
  console.log(`Locales de test restantes:  ${quedan?.length ?? 0}`);
  console.log(`Usuarios de test restantes: ${quedanUsuarios.length}`);

  if (fallos.length || quedan?.length || quedanUsuarios.length) {
    console.error("\n⚠️  La limpieza no quedó completa.");
    for (const f of fallos) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\n✅ Limpieza completa.");
}

main().catch((err) => {
  console.error("Error fatal:", err.message);
  process.exit(1);
});
