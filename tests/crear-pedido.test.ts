import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  anonClient,
  adminClient,
  setupTestFixtures,
  cleanupTestFixtures,
  type TestFixtures,
} from "./setup";

describe("RPC crear_pedido", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  test("Pedido válido calcula total en servidor y retorna UUID", async () => {
    const { data: orderId, error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Juan Pérez",
      p_mesa: "Mesa 1",
      p_notas: "Sin cebolla",
      p_items: [
        { producto_id: fixtures.localA.prodAvailable.id, cantidad: 2, notas: "Extra salsa" },
      ],
    });

    expect(error).toBeNull();
    expect(orderId).toBeDefined();

    // Verificación directa con service-role
    const { data: pedido } = await adminClient
      .from("pedidos")
      .select("*, pedido_items(*)")
      .eq("id", orderId!)
      .single();

    expect(pedido).toBeDefined();
    expect(pedido?.nombre_cliente).toBe("Juan Pérez");
    expect(pedido?.total).toBe(fixtures.localA.prodAvailable.precio * 2);
  });

  test("Producto de otro local en los ítems debe fallar", async () => {
    const { error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Hacker Local Cross",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [
        { producto_id: fixtures.localB.prodAvailable.id, cantidad: 1, notas: "" },
      ],
    });

    expect(error).not.toBeNull();
  });

  test("Producto con disponible=false debe fallar", async () => {
    const { error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Cliente Agotado",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [
        { producto_id: fixtures.localA.prodUnavailable.id, cantidad: 1, notas: "" },
      ],
    });

    expect(error).not.toBeNull();
  });

  test("Cantidad 100 de un producto debe ser rechazada (T2: cantidad <= 99)", async () => {
    const { error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Cliente Mayorista",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [
        { producto_id: fixtures.localA.prodAvailable.id, cantidad: 100, notas: "" },
      ],
    });

    expect(error).not.toBeNull();
  });

  test("Más de 50 ítems distintos debe ser rechazado (T2: <= 50 productos)", async () => {
    const items = Array.from({ length: 51 }, () => ({
      producto_id: fixtures.localA.prodAvailable.id,
      cantidad: 1,
      notas: "",
    }));

    const { error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Cliente 51 Items",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: items,
    });

    expect(error).not.toBeNull();
  });

  test("Local con activo=false debe rechazar el pedido", async () => {
    // Desactivar temporalmente local B con adminClient
    await adminClient
      .from("locales")
      .update({ activo: false })
      .eq("id", fixtures.localB.id);

    const { error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localB.id,
      p_nombre: "Cliente Local Inactivo",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [
        { producto_id: fixtures.localB.prodAvailable.id, cantidad: 1, notas: "" },
      ],
    });

    expect(error).not.toBeNull();

    // Reactivar local B
    await adminClient
      .from("locales")
      .update({ activo: true })
      .eq("id", fixtures.localB.id);
  });

  test("Un local nuevo arranca con el límite por defecto de 40 pedidos/min (F5.2)", async () => {
    const { data: local } = await adminClient
      .from("locales")
      .select("limite_pedidos_min")
      .eq("id", fixtures.localA.id)
      .single();

    expect(local?.limite_pedidos_min).toBe(40);
  });

  test("Rate-limit: se respeta el límite configurado en el local (F5.2)", async () => {
    // El tope ya no está fijo en la RPC: se lee de locales.limite_pedidos_min.
    // Se baja a 5 en el local B para probarlo sin generar 40 pedidos.
    const LIMITE = 5;
    await adminClient
      .from("locales")
      .update({ limite_pedidos_min: LIMITE })
      .eq("id", fixtures.localB.id);

    let lastError: { message: string } | null = null;
    let creados = 0;

    try {
      for (let i = 1; i <= LIMITE + 1; i++) {
        const { error } = await anonClient.rpc("crear_pedido", {
          p_local_id: fixtures.localB.id,
          p_nombre: `Spammer ${i}`,
          p_mesa: "Mesa 1",
          p_notas: "",
          p_items: [
            { producto_id: fixtures.localB.prodAvailable.id, cantidad: 1, notas: "" },
          ],
        });

        if (error) {
          lastError = error;
          break;
        }
        creados++;
      }

      // Debe haber dejado pasar exactamente los del límite y cortar en el siguiente.
      // (Asume que ningún test anterior creó pedidos en el local B.)
      expect(creados).toBe(LIMITE);
      expect(lastError).not.toBeNull();
      expect(lastError!.message).toMatch(/Demasiados pedidos/i);
    } finally {
      // En `finally`: si un expect falla, el local igual queda restaurado.
      await adminClient
        .from("locales")
        .update({ limite_pedidos_min: 40 })
        .eq("id", fixtures.localB.id);
    }
  });
});
