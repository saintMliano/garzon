import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  anonClient,
  adminClient,
  setupTestFixtures,
  cleanupTestFixtures,
  type TestFixtures,
} from "./setup";

// ============================================================================
// F7 — get_menu_publico(p_slug text) -> jsonb
// Ver supabase/migrations/20260811181119_f7_menu_publico.sql
//
// Es SECURITY DEFINER a propósito: existe para poder quitarle a `anon` la
// lectura directa de `locales`, `categorias` y `productos`. Por eso los tests
// que más importan son los de superficie expuesta: que NO se filtre `activo`,
// que NO se filtren locales inactivos, que NO aparezcan productos agotados y
// que NO se cruce data entre locales. Un DEFINER que devuelve de más es una
// fuga, no un bug cosmético.
// ============================================================================

type ClienteSupabase = typeof anonClient;

type RespuestaRpc<T> = { data: T | null; error: { message: string } | null };

/**
 * `get_menu_publico` todavía no está en los tipos generados
 * (`src/types/supabase.ts`), así que se llama por un ejecutor tipado a mano.
 * Es un cast estrecho y explícito, no un `any`.
 */
interface EjecutorRpc {
  rpc<T>(nombre: string, args: Record<string, unknown>): PromiseLike<RespuestaRpc<T>>;
}

function rpc(cliente: ClienteSupabase): EjecutorRpc {
  return cliente as unknown as EjecutorRpc;
}

interface LocalPublico {
  id: string;
  nombre: string;
  slug: string;
  color_primario: string;
  // El resto de columnas de `locales` viajan tal cual; se consultan por índice
  // para poder afirmar que `activo` NO está.
  [columna: string]: unknown;
}

interface CategoriaPublica {
  id: string;
  local_id: string;
  nombre: string;
  orden: number | null;
}

interface ProductoPublico {
  id: string;
  local_id: string;
  categoria_id: string | null;
  nombre: string;
  precio: number;
  disponible: boolean;
  orden: number | null;
}

interface MenuPublico {
  local: LocalPublico;
  categorias: CategoriaPublica[];
  productos: ProductoPublico[];
}

/** Comparador del contrato: `orden` ascendente con NULLS LAST, después `nombre`. */
function comparaPorOrdenYNombre(
  a: { orden: number | null; nombre: string },
  b: { orden: number | null; nombre: string }
): number {
  if (a.orden !== b.orden) {
    if (a.orden === null) return 1;
    if (b.orden === null) return -1;
    return a.orden - b.orden;
  }
  return a.nombre.localeCompare(b.nombre);
}

describe("RPC get_menu_publico (F7)", () => {
  let fixtures: TestFixtures;

  async function menuDe(slug: string, cliente: ClienteSupabase = anonClient) {
    return rpc(cliente).rpc<MenuPublico | null>("get_menu_publico", { p_slug: slug });
  }

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  test("Caso feliz: devuelve el local, sus categorías y sus productos", async () => {
    const { data, error } = await menuDe(fixtures.localA.slug);

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const menu = data!;
    expect(menu.local.id).toBe(fixtures.localA.id);
    expect(menu.local.slug).toBe(fixtures.localA.slug);
    expect(menu.local.nombre).toBe(fixtures.localA.nombre);
    expect(menu.local.color_primario).toBe("#f97316");

    expect(Array.isArray(menu.categorias)).toBe(true);
    expect(menu.categorias.map((c) => c.id)).toContain(fixtures.localA.catId);

    expect(Array.isArray(menu.productos)).toBe(true);
    const disponible = menu.productos.find((p) => p.id === fixtures.localA.prodAvailable.id);
    expect(disponible).toBeDefined();
    expect(disponible!.nombre).toBe(fixtures.localA.prodAvailable.nombre);
    expect(disponible!.precio).toBe(fixtures.localA.prodAvailable.precio);
  });

  test("Se acabó la palta: los productos con disponible = false no salen en el menú", async () => {
    const { data, error } = await menuDe(fixtures.localA.slug);

    expect(error).toBeNull();
    const menu = data!;

    const ids = menu.productos.map((p) => p.id);
    expect(ids).toContain(fixtures.localA.prodAvailable.id);
    expect(ids).not.toContain(fixtures.localA.prodUnavailable.id);

    // Y por las dudas, ninguno de los devueltos viene marcado como no disponible.
    expect(menu.productos.every((p) => p.disponible === true)).toBe(true);

    // El producto agotado sí existe en la base: el filtro es de la RPC, no del fixture.
    const { data: agotado } = await adminClient
      .from("productos")
      .select("id, disponible")
      .eq("id", fixtures.localA.prodUnavailable.id)
      .single();
    expect(agotado?.disponible).toBe(false);
  });

  test("La columna `activo` no se expone en el objeto local", async () => {
    const { data, error } = await menuDe(fixtures.localA.slug);

    expect(error).toBeNull();
    const menu = data!;

    expect("activo" in menu.local).toBe(false);
    // Y las columnas que sí son parte del contrato siguen ahí.
    expect("id" in menu.local).toBe(true);
    expect("slug" in menu.local).toBe(true);
    expect("nombre" in menu.local).toBe(true);
  });

  test("Slug inexistente: devuelve null sin error", async () => {
    const { data, error } = await menuDe(`no-existe-${Date.now()}-${Math.random()}`);

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test("Local inactivo: devuelve null (y se restaura el local)", async () => {
    const { error: errApagar } = await adminClient
      .from("locales")
      .update({ activo: false })
      .eq("id", fixtures.localB.id);
    expect(errApagar).toBeNull();

    try {
      const { data, error } = await menuDe(fixtures.localB.slug);
      expect(error).toBeNull();
      expect(data).toBeNull();
    } finally {
      // Se reactiva pase lo que pase con el assert: si queda apagado, los tests
      // siguientes mienten y la limpieza se vuelve confusa.
      const { error: errPrender } = await adminClient
        .from("locales")
        .update({ activo: true })
        .eq("id", fixtures.localB.id);
      if (errPrender) throw new Error(`No se pudo reactivar el local B: ${errPrender.message}`);
    }

    // Reactivado, el menú vuelve a responder.
    const { data: revivido } = await menuDe(fixtures.localB.slug);
    expect(revivido).not.toBeNull();
    expect(revivido!.local.id).toBe(fixtures.localB.id);
  });

  test("AISLAMIENTO: el menú del local A no trae nada del local B", async () => {
    const { data, error } = await menuDe(fixtures.localA.slug);

    expect(error).toBeNull();
    const menu = data!;

    // Ni por id concreto del fixture...
    expect(menu.categorias.map((c) => c.id)).not.toContain(fixtures.localB.catId);
    expect(menu.productos.map((p) => p.id)).not.toContain(fixtures.localB.prodAvailable.id);

    // ...ni por local_id: TODO lo devuelto tiene que ser del local A.
    expect(menu.categorias.every((c) => c.local_id === fixtures.localA.id)).toBe(true);
    expect(menu.productos.every((p) => p.local_id === fixtures.localA.id)).toBe(true);
    expect(menu.local.id).not.toBe(fixtures.localB.id);

    // Y el espejo: el menú del local B tampoco trae nada del A.
    const { data: menuB } = await menuDe(fixtures.localB.slug);
    expect(menuB).not.toBeNull();
    expect(menuB!.categorias.map((c) => c.id)).not.toContain(fixtures.localA.catId);
    expect(menuB!.productos.map((p) => p.id)).not.toContain(fixtures.localA.prodAvailable.id);
    expect(menuB!.categorias.every((c) => c.local_id === fixtures.localB.id)).toBe(true);
    expect(menuB!.productos.every((p) => p.local_id === fixtures.localB.id)).toBe(true);
  });

  test("El cliente anónimo puede ejecutarla: el menú es público", async () => {
    // Caso de uso principal: el comensal escanea el QR y no tiene sesión.
    const { data, error } = await rpc(anonClient).rpc<MenuPublico | null>("get_menu_publico", {
      p_slug: fixtures.localA.slug,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.local.slug).toBe(fixtures.localA.slug);
    expect(data!.productos.length).toBeGreaterThan(0);
  });

  test("Ordenamiento: categorías por `orden` (NULLS LAST) y después por nombre", async () => {
    // Se insertan a propósito en orden inverso al esperado, para que el
    // resultado no pueda pasar por coincidencia con el orden de inserción.
    const { data: catOrden2, error: err2 } = await adminClient
      .from("categorias")
      .insert({ local_id: fixtures.localA.id, nombre: "ZZ Orden Test 2", orden: 2 })
      .select()
      .single();
    expect(err2).toBeNull();

    const { data: catOrden1, error: err1 } = await adminClient
      .from("categorias")
      .insert({ local_id: fixtures.localA.id, nombre: "ZZ Orden Test 1", orden: 1 })
      .select()
      .single();
    expect(err1).toBeNull();

    // Sin `orden`: tiene que quedar al final pese a que su nombre es alfabéticamente menor.
    const { data: catSinOrden, error: errSin } = await adminClient
      .from("categorias")
      .insert({ local_id: fixtures.localA.id, nombre: "AAA Sin Orden Test", orden: null })
      .select()
      .single();
    expect(errSin).toBeNull();

    const { data, error } = await menuDe(fixtures.localA.slug);
    expect(error).toBeNull();

    const ids = data!.categorias.map((c) => c.id);
    const pos1 = ids.indexOf(catOrden1!.id);
    const pos2 = ids.indexOf(catOrden2!.id);
    const posSin = ids.indexOf(catSinOrden!.id);

    expect(pos1).toBeGreaterThanOrEqual(0);
    expect(pos2).toBeGreaterThanOrEqual(0);
    expect(posSin).toBeGreaterThanOrEqual(0);

    expect(pos1).toBeLessThan(pos2);
    expect(pos2).toBeLessThan(posSin);

    // La lista completa respeta el comparador del contrato.
    const copiaOrdenada = [...data!.categorias].sort(comparaPorOrdenYNombre);
    expect(data!.categorias.map((c) => c.id)).toEqual(copiaOrdenada.map((c) => c.id));

    // Los productos también.
    const prodsOrdenados = [...data!.productos].sort(comparaPorOrdenYNombre);
    expect(data!.productos.map((p) => p.id)).toEqual(prodsOrdenados.map((p) => p.id));
  });

  test("Coherencia: los productos de la RPC son exactamente los del select directo", async () => {
    const { data, error } = await menuDe(fixtures.localA.slug);
    expect(error).toBeNull();

    const { data: directos, error: errDirecto } = await adminClient
      .from("productos")
      .select("id")
      .eq("local_id", fixtures.localA.id)
      .eq("disponible", true);

    expect(errDirecto).toBeNull();

    const idsRpc = data!.productos.map((p) => p.id).sort();
    const idsDirectos = (directos ?? []).map((p) => p.id).sort();

    expect(idsRpc).toEqual(idsDirectos);
    expect(idsRpc.length).toBeGreaterThan(0);
  });

  // ============================================================
  // Enumeración cerrada (hallazgo M1)
  //
  // Con la anon key —que viaja en el bundle de cualquier navegador— antes se
  // podía hacer `select * from locales` y llevarse la cartera completa de
  // clientes de la plataforma. El menú público ya no necesita esas tablas: pasa
  // por `get_menu_publico`, que exige saber el slug.
  //
  // Si alguien vuelve a abrir la lectura pública, estos tests se ponen en rojo.
  // ============================================================
  test("El anónimo NO puede enumerar locales, categorias ni productos (M1)", async () => {
    for (const tabla of ["locales", "categorias", "productos"] as const) {
      const { data } = await anonClient.from(tabla).select("*");
      expect(
        data?.length ?? 0,
        `"${tabla}" volvió a ser enumerable con la anon key`
      ).toBe(0);
    }
  });

  test("Pero el menú público sigue sirviéndose por slug (M1 no rompió el flujo)", async () => {
    const { data, error } = await menuDe(fixtures.localA.slug);
    expect(error).toBeNull();
    expect(data?.local.id).toBe(fixtures.localA.id);
    expect(data!.productos.length).toBeGreaterThan(0);
  });
});
