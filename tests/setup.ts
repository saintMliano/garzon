import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import type { Database } from "@/types/database";

// Cargar variables de entorno desde .env.test
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

export const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Faltan variables de entorno requeridas en .env.test (TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY)."
  );
}

// Cliente Admin (service-role, bypassa RLS)
export const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Cliente Anónimo (simula cliente de la web pública)
export const anonClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export type TestFixtures = {
  localA: {
    id: string;
    slug: string;
    nombre: string;
    catId: string;
    prodAvailable: { id: string; nombre: string; precio: number };
    prodUnavailable: { id: string; nombre: string; precio: number };
  };
  localB: {
    id: string;
    slug: string;
    nombre: string;
    catId: string;
    prodAvailable: { id: string; nombre: string; precio: number };
  };
  staffA: {
    id: string;
    email: string;
    pass: string;
  };
  staffB: {
    id: string;
    email: string;
    pass: string;
  };
};

export async function setupTestFixtures(): Promise<TestFixtures> {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);

  // 1. Crear Locales de Prueba
  const slugA = `test-local-a-${ts}-${rand}`;
  const slugB = `test-local-b-${ts}-${rand}`;

  const { data: localA, error: errLocalA } = await adminClient
    .from("locales")
    .insert({
      nombre: `Test Local A ${ts}`,
      slug: slugA,
      direccion: "Calle Test 123",
      color_primario: "#f97316",
      color_acento: "#f97316",
      activo: true,
      mesas: ["Mesa 1", "Mesa 2"],
    })
    .select()
    .single();

  if (errLocalA || !localA) throw new Error(`Error creando Local A: ${errLocalA?.message}`);

  const { data: localB, error: errLocalB } = await adminClient
    .from("locales")
    .insert({
      nombre: `Test Local B ${ts}`,
      slug: slugB,
      direccion: "Calle Test 456",
      color_primario: "#3b82f6",
      color_acento: "#3b82f6",
      activo: true,
      mesas: ["Mesa A"],
    })
    .select()
    .single();

  if (errLocalB || !localB) throw new Error(`Error creando Local B: ${errLocalB?.message}`);

  // 2. Crear Categorías
  const { data: catA, error: errCatA } = await adminClient
    .from("categorias")
    .insert({ local_id: localA.id, nombre: "Hamburguesas Test", orden: 1, icono: "🍔" })
    .select()
    .single();

  if (errCatA || !catA) throw new Error(`Error creando Categoria A: ${errCatA?.message}`);

  const { data: catB, error: errCatB } = await adminClient
    .from("categorias")
    .insert({ local_id: localB.id, nombre: "Bebidas Test", orden: 1, icono: "🥤" })
    .select()
    .single();

  if (errCatB || !catB) throw new Error(`Error creando Categoria B: ${errCatB?.message}`);

  // 3. Crear Productos
  const { data: prodA1, error: errProdA1 } = await adminClient
    .from("productos")
    .insert({
      local_id: localA.id,
      categoria_id: catA.id,
      nombre: "Burguer Clasica",
      precio: 5000,
      disponible: true,
      orden: 1,
    })
    .select()
    .single();

  const { data: prodA2, error: errProdA2 } = await adminClient
    .from("productos")
    .insert({
      local_id: localA.id,
      categoria_id: catA.id,
      nombre: "Burguer Agotada",
      precio: 6000,
      disponible: false,
      orden: 2,
    })
    .select()
    .single();

  const { data: prodB1, error: errProdB1 } = await adminClient
    .from("productos")
    .insert({
      local_id: localB.id,
      categoria_id: catB.id,
      nombre: "Cola Test",
      precio: 2000,
      disponible: true,
      orden: 1,
    })
    .select()
    .single();

  if (errProdA1 || errProdA2 || errProdB1 || !prodA1 || !prodA2 || !prodB1) {
    throw new Error("Error creando productos de prueba");
  }

  // 4. Crear Usuarios de Prueba en Auth con reintento por rate-limit/JWT transient errors
  async function createTestUser(email: string, pass: string) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await adminClient.auth.admin.createUser({
        email,
        password: pass,
        email_confirm: true,
      });
      if (res.data?.user) return res.data.user;
      if (attempt === 3) throw new Error(`Error creando usuario ${email}: ${res.error?.message}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    throw new Error(`Error creando usuario ${email}`);
  }

  const emailA = `test-staff-a-${ts}-${rand}@test.garzon`;
  const passA = `PassA-${ts}!`;
  const userAObj = await createTestUser(emailA, passA);

  const emailB = `test-staff-b-${ts}-${rand}@test.garzon`;
  const passB = `PassB-${ts}!`;
  const userBObj = await createTestUser(emailB, passB);

  // 5. Vincular Staff a Locales
  await adminClient.from("local_staff").insert([
    { user_id: userAObj.id, local_id: localA.id },
    { user_id: userBObj.id, local_id: localB.id },
  ]);

  return {
    localA: {
      id: localA.id,
      slug: slugA,
      nombre: localA.nombre,
      catId: catA.id,
      prodAvailable: { id: prodA1.id, nombre: prodA1.nombre, precio: prodA1.precio },
      prodUnavailable: { id: prodA2.id, nombre: prodA2.nombre, precio: prodA2.precio },
    },
    localB: {
      id: localB.id,
      slug: slugB,
      nombre: localB.nombre,
      catId: catB.id,
      prodAvailable: { id: prodB1.id, nombre: prodB1.nombre, precio: prodB1.precio },
    },
    staffA: { id: userAObj.id, email: emailA, pass: passA },
    staffB: { id: userBObj.id, email: emailB, pass: passB },
  };
}

export async function cleanupTestFixtures(fixtures: TestFixtures) {
  if (!fixtures) return;

  const localIds = [fixtures.localA.id, fixtures.localB.id];
  const userIds = [fixtures.staffA.id, fixtures.staffB.id];

  // Los fallos NO se tragan: si la limpieza falla en silencio, los locales de
  // prueba quedan vivos y visibles en la base real (ya pasó: 10 huérfanos el
  // 2026-08-10). Se acumulan los errores y se verifica el resultado al final.
  const fallos: string[] = [];

  // PromiseLike y no Promise: los builders de postgrest-js son thenables, no
  // promesas completas.
  async function paso(nombre: string, fn: () => PromiseLike<{ error: unknown } | void>) {
    try {
      const res = await fn();
      const error = res && typeof res === "object" && "error" in res ? res.error : null;
      if (error) fallos.push(`${nombre}: ${JSON.stringify(error)}`);
    } catch (err) {
      fallos.push(`${nombre}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 1. Borrar pedidos e ítems asociados
  const { data: pedidos } = await adminClient
    .from("pedidos")
    .select("id")
    .in("local_id", localIds);

  if (pedidos && pedidos.length > 0) {
    const orderIds = pedidos.map((p) => p.id);
    await paso("pedido_items", () =>
      adminClient.from("pedido_items").delete().in("pedido_id", orderIds)
    );
    await paso("pedidos", () => adminClient.from("pedidos").delete().in("id", orderIds));
  }

  // 2. Borrar productos y categorías
  await paso("productos", () => adminClient.from("productos").delete().in("local_id", localIds));
  await paso("categorias", () => adminClient.from("categorias").delete().in("local_id", localIds));

  // 3. Borrar local_staff
  await paso("local_staff", () => adminClient.from("local_staff").delete().in("local_id", localIds));

  // 4. Borrar locales
  await paso("locales", () => adminClient.from("locales").delete().in("id", localIds));

  // 5. Borrar usuarios de Auth.
  //    Se devuelve el resultado (no `await` a secas dentro del callback): de lo
  //    contrario `paso` recibe `void` y el `{ error }` de deleteUser se pierde,
  //    que es exactamente el fallo silencioso que este refactor viene a matar.
  for (const uid of userIds) {
    await paso(`usuario ${uid}`, () => adminClient.auth.admin.deleteUser(uid));
  }

  // 6. Verificar que de verdad no quedó nada, ni locales ni cuentas.
  const { data: restantes } = await adminClient.from("locales").select("slug").in("id", localIds);
  if (restantes && restantes.length > 0) {
    fallos.push(`quedaron locales sin borrar: ${restantes.map((l) => l.slug).join(", ")}`);
  }

  const { data: usuariosRestantes } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const huerfanos = (usuariosRestantes?.users ?? []).filter((u) => userIds.includes(u.id));
  if (huerfanos.length > 0) {
    fallos.push(`quedaron usuarios sin borrar: ${huerfanos.map((u) => u.email).join(", ")}`);
  }

  if (fallos.length > 0) {
    throw new Error(
      "[cleanupTestFixtures] La limpieza dejó datos huérfanos en la base:\n  - " +
        fallos.join("\n  - ") +
        "\n  Corré `node scripts/limpiar-datos-test.mjs --borrar` para limpiar."
    );
  }
}

export async function createAuthenticatedClient(email: string, pass: string) {
  const client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: pass });
  if (error) throw new Error(`Error autenticando cliente test (${email}): ${error.message}`);
  return client;
}
