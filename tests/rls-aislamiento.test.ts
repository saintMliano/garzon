import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  anonClient,
  adminClient,
  setupTestFixtures,
  cleanupTestFixtures,
  createAuthenticatedClient,
  type TestFixtures,
} from "./setup";

describe("RLS y Aislamiento Multi-tenant", () => {
  let fixtures: TestFixtures;
  let clientStaffA: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let clientStaffB: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let orderIdA: string;
  let orderIdB: string;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
    clientStaffA = await createAuthenticatedClient(fixtures.staffA.email, fixtures.staffA.pass);
    clientStaffB = await createAuthenticatedClient(fixtures.staffB.email, fixtures.staffB.pass);

    // Crear un pedido directo en cada local usando RPC crear_pedido
    const { data: idA } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Cliente A",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localA.prodAvailable.id, cantidad: 1, notas: "" }],
    });
    orderIdA = idA!;

    const { data: idB } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localB.id,
      p_nombre: "Cliente B",
      p_mesa: "Mesa A",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localB.prodAvailable.id, cantidad: 1, notas: "" }],
    });
    orderIdB = idB!;
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  test("Cliente anónimo NO puede SELECT en pedidos ni pedido_items", async () => {
    const { data: dataPedidos, error: errorPedidos } = await anonClient
      .from("pedidos")
      .select("*");
    expect(dataPedidos?.length ?? 0).toBe(0);

    const { data: dataItems, error: errorItems } = await anonClient
      .from("pedido_items")
      .select("*");
    expect(dataItems?.length ?? 0).toBe(0);
  });

  test("Cliente anónimo NO puede INSERT directo en pedidos", async () => {
    const { data, error } = await anonClient.from("pedidos").insert({
      local_id: fixtures.localA.id,
      nombre_cliente: "Hacker Anon",
      mesa: "Mesa 1",
      total: 100,
      estado: "nuevo",
      numero_pedido: 999,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  test("Staff A ve pedidos de su local A pero CERO del local B", async () => {
    const { data: pedidosA } = await clientStaffA.from("pedidos").select("*");
    expect(pedidosA).toBeDefined();

    const ids = (pedidosA ?? []).map((p) => p.id);
    expect(ids).toContain(orderIdA);
    expect(ids).not.toContain(orderIdB);
  });

  test("Staff A NO puede UPDATE un pedido del local B", async () => {
    const { data, error } = await clientStaffA
      .from("pedidos")
      .update({ estado: "aceptado" })
      .eq("id", orderIdB)
      .select();

    expect(data?.length ?? 0).toBe(0);
  });

  test("Staff A NO puede UPDATE slug ni activo de su propio local (T4)", async () => {
    const { error: errorSlug } = await clientStaffA
      .from("locales")
      .update({ slug: "hacked-slug" })
      .eq("id", fixtures.localA.id);
    expect(errorSlug).not.toBeNull();

    const { error: errorActivo } = await clientStaffA
      .from("locales")
      .update({ activo: false })
      .eq("id", fixtures.localA.id);
    expect(errorActivo).not.toBeNull();
  });

  test("Staff A NO puede UPDATE el total de un pedido (T3)", async () => {
    const { error } = await clientStaffA
      .from("pedidos")
      .update({ total: 0 })
      .eq("id", orderIdA);
    expect(error).not.toBeNull();
  });
});
