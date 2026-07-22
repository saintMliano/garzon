import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  anonClient,
  setupTestFixtures,
  cleanupTestFixtures,
  createAuthenticatedClient,
  type TestFixtures,
} from "./setup";

describe("Máquina de Estados de Pedidos (T3)", () => {
  let fixtures: TestFixtures;
  let clientStaffA: Awaited<ReturnType<typeof createAuthenticatedClient>>;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
    clientStaffA = await createAuthenticatedClient(fixtures.staffA.email, fixtures.staffA.pass);
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  async function crearPedidoHelper() {
    const { data: id } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Test Estado",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localA.prodAvailable.id, cantidad: 1, notas: "" }],
    });
    return id!;
  }

  test("Transición secuencial válida: nuevo -> aceptado -> preparando -> listo -> entregado", async () => {
    const orderId = await crearPedidoHelper();

    // 1. nuevo -> aceptado
    const { data: d1, error: e1 } = await clientStaffA
      .from("pedidos")
      .update({ estado: "aceptado" })
      .eq("id", orderId)
      .select();
    expect(e1).toBeNull();
    expect(d1?.[0].estado).toBe("aceptado");

    // 2. aceptado -> preparando
    const { data: d2, error: e2 } = await clientStaffA
      .from("pedidos")
      .update({ estado: "preparando" })
      .eq("id", orderId)
      .select();
    expect(e2).toBeNull();
    expect(d2?.[0].estado).toBe("preparando");

    // 3. preparando -> listo
    const { data: d3, error: e3 } = await clientStaffA
      .from("pedidos")
      .update({ estado: "listo" })
      .eq("id", orderId)
      .select();
    expect(e3).toBeNull();
    expect(d3?.[0].estado).toBe("listo");

    // 4. listo -> entregado
    const { data: d4, error: e4 } = await clientStaffA
      .from("pedidos")
      .update({ estado: "entregado" })
      .eq("id", orderId)
      .select();
    expect(e4).toBeNull();
    expect(d4?.[0].estado).toBe("entregado");
  });

  test("Transición inválida: nuevo -> entregado (salto directo) debe ser rechazada", async () => {
    const orderId = await crearPedidoHelper();

    const { error } = await clientStaffA
      .from("pedidos")
      .update({ estado: "entregado" })
      .eq("id", orderId);

    expect(error).not.toBeNull();
  });

  test("Transición inválida: cancelado -> nuevo (reversa) debe ser rechazada", async () => {
    const orderId = await crearPedidoHelper();

    // Cancelar el pedido primero (nuevo -> cancelado es válido)
    await clientStaffA
      .from("pedidos")
      .update({ estado: "cancelado" })
      .eq("id", orderId);

    // Intentar pasar cancelado -> nuevo
    const { error } = await clientStaffA
      .from("pedidos")
      .update({ estado: "nuevo" })
      .eq("id", orderId);

    expect(error).not.toBeNull();
  });

  test("Transición inválida: listo -> cancelado (cancelar un pedido ya listo) debe ser rechazada", async () => {
    const orderId = await crearPedidoHelper();

    // Avanzar hasta listo
    await clientStaffA.from("pedidos").update({ estado: "aceptado" }).eq("id", orderId);
    await clientStaffA.from("pedidos").update({ estado: "preparando" }).eq("id", orderId);
    await clientStaffA.from("pedidos").update({ estado: "listo" }).eq("id", orderId);

    // Intentar listo -> cancelado
    const { error } = await clientStaffA
      .from("pedidos")
      .update({ estado: "cancelado" })
      .eq("id", orderId);

    expect(error).not.toBeNull();
  });
});
