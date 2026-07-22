import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  anonClient,
  setupTestFixtures,
  cleanupTestFixtures,
  type TestFixtures,
} from "./setup";

describe("RPC get_order_status", () => {
  let fixtures: TestFixtures;
  let orderId: string;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
    const { data: id } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Cliente Status Test",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localA.prodAvailable.id, cantidad: 1, notas: "" }],
    });
    orderId = id!;
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  test("Cliente anónimo obtiene estado, número de pedido y fecha con UUID válido", async () => {
    const { data, error } = await anonClient.rpc("get_order_status", {
      p_order_id: orderId,
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();

    const result = (Array.isArray(data) ? data[0] : data) as {
      estado: string;
      numero_pedido: number;
      created_at: string;
    };

    expect(result.estado).toBe("nuevo");
    expect(result.numero_pedido).toBeGreaterThan(0);
    expect(result.created_at).toBeDefined();
  });

  test("UUID aleatorio retorna vacío sin revelar errores de información", async () => {
    const randomUuid = "00000000-0000-0000-0000-000000000000";
    const { data, error } = await anonClient.rpc("get_order_status", {
      p_order_id: randomUuid,
    });

    expect(error).toBeNull();
    expect(data === null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });
});
