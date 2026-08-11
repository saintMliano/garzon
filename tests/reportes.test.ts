import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  anonClient,
  adminClient,
  setupTestFixtures,
  cleanupTestFixtures,
  createAuthenticatedClient,
  type TestFixtures,
} from "./setup";

// ============================================================================
// F6 — RPCs de reportes (reporte_ventas, reporte_ventas_por_dia,
// reporte_top_productos). Ver supabase/migrations/20260811173951_f6_reportes_ventas.sql
//
// Las tres son SECURITY INVOKER a propósito: el aislamiento por local lo hace la
// RLS, no un chequeo de membresía escrito a mano. El test "Aislamiento" de este
// archivo es el que se pone en rojo si alguien las convierte a DEFINER.
// ============================================================================

type ClienteSupabase = Awaited<ReturnType<typeof createAuthenticatedClient>>;

type EstadoPedido = "nuevo" | "aceptado" | "preparando" | "listo" | "entregado" | "cancelado";

type RespuestaRpc<T> = { data: T | null; error: { message: string } | null };

/**
 * Las funciones de reportes todavía no están en los tipos generados
 * (`src/types/supabase.ts`), así que se llaman por un ejecutor tipado a mano.
 * Es un cast estrecho y explícito, no un `any`.
 */
interface EjecutorRpc {
  rpc<T>(nombre: string, args: Record<string, unknown>): PromiseLike<RespuestaRpc<T>>;
}

function rpc(cliente: ClienteSupabase): EjecutorRpc {
  return cliente as unknown as EjecutorRpc;
}

type ResumenVentas = {
  pedidos_total: number;
  pedidos_entregados: number;
  pedidos_pendientes: number;
  pedidos_cancelados: number;
  venta_entregada: number;
  venta_total: number;
  ticket_promedio: number;
};

type VentaPorDia = { dia: string; pedidos: number; venta: number };

type TopProducto = { producto_id: string; nombre: string; unidades: number; venta: number };

/** Fecha de calendario chileno, que es el corte que usan las RPCs. */
function hoyEnChile(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

describe("RPCs de reportes (F6)", () => {
  let fixtures: TestFixtures;
  let clientStaffA: ClienteSupabase;
  let clientStaffB: ClienteSupabase;

  // Segundo producto disponible en el local A: los fixtures solo traen uno
  // vendible (el otro es `disponible: false`) y hace falta un par para probar
  // el orden del top de productos.
  let prodExtraA: { id: string; nombre: string; precio: number };

  const hoy = hoyEnChile();

  // Escenario determinista armado en beforeAll. Los tests solo miran el mismo
  // estado final desde ángulos distintos, así que no dependen del orden.
  //
  //   P1  prodAvailable x2                        -> queda "nuevo"      (pendiente)
  //   P2  prodAvailable x1 + prodExtra x3         -> llevado a entregado
  //   P3  prodExtra x2                            -> queda "nuevo"      (pendiente)
  //   P4  prodAvailable x1                        -> cancelado
  const ESPERADO = {
    pedidosTotal: 4,
    pedidosEntregados: 1,
    pedidosPendientes: 2,
    pedidosCancelados: 1,
    ventaEntregada: 0, // se calcula en beforeAll con los precios reales
    ventaTotal: 0,
    ticketPromedio: 0,
  };

  async function crearPedido(
    items: { producto_id: string; cantidad: number; notas: string }[],
    nombre: string
  ): Promise<string> {
    const { data, error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: nombre,
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: items,
    });
    if (error || !data) throw new Error(`No se pudo crear el pedido "${nombre}": ${error?.message}`);
    return data;
  }

  async function avanzarEstado(orderId: string, estado: EstadoPedido) {
    const { error } = await clientStaffA
      .from("pedidos")
      .update({ estado })
      .eq("id", orderId);
    if (error) throw new Error(`No se pudo pasar el pedido ${orderId} a ${estado}: ${error.message}`);
  }

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
    clientStaffA = await createAuthenticatedClient(fixtures.staffA.email, fixtures.staffA.pass);
    clientStaffB = await createAuthenticatedClient(fixtures.staffB.email, fixtures.staffB.pass);

    const { data: extra, error: errExtra } = await adminClient
      .from("productos")
      .insert({
        local_id: fixtures.localA.id,
        categoria_id: fixtures.localA.catId,
        nombre: "Papas Fritas Test",
        // Precio elegido para que la venta total NO sea divisible por 3: así el
        // test del ticket promedio ejercita de verdad la división entera de
        // Postgres (trunca, no redondea).
        precio: 3500,
        disponible: true,
        orden: 3,
      })
      .select()
      .single();

    if (errExtra || !extra) throw new Error(`Error creando producto extra: ${errExtra?.message}`);
    prodExtraA = { id: extra.id, nombre: extra.nombre, precio: extra.precio };

    const pA = fixtures.localA.prodAvailable;

    const p1 = await crearPedido(
      [{ producto_id: pA.id, cantidad: 2, notas: "" }],
      "Reporte P1 pendiente"
    );
    const p2 = await crearPedido(
      [
        { producto_id: pA.id, cantidad: 1, notas: "" },
        { producto_id: prodExtraA.id, cantidad: 3, notas: "" },
      ],
      "Reporte P2 entregado"
    );
    const p3 = await crearPedido(
      [{ producto_id: prodExtraA.id, cantidad: 2, notas: "" }],
      "Reporte P3 pendiente"
    );
    const p4 = await crearPedido(
      [{ producto_id: pA.id, cantidad: 1, notas: "" }],
      "Reporte P4 cancelado"
    );

    // P2 recorre la máquina de estados completa, un paso por vez.
    await avanzarEstado(p2, "aceptado");
    await avanzarEstado(p2, "preparando");
    await avanzarEstado(p2, "listo");
    await avanzarEstado(p2, "entregado");

    // P4 se cancela (nuevo -> cancelado es transición válida).
    await avanzarEstado(p4, "cancelado");

    // P1 y P3 quedan en "nuevo" a propósito.
    void p1;
    void p3;

    const totalP1 = pA.precio * 2;
    const totalP2 = pA.precio * 1 + prodExtraA.precio * 3;
    const totalP3 = prodExtraA.precio * 2;

    ESPERADO.ventaEntregada = totalP2;
    ESPERADO.ventaTotal = totalP1 + totalP2 + totalP3;
    ESPERADO.ticketPromedio = Math.floor(ESPERADO.ventaTotal / 3);
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  test("reporte_ventas: los totales cuadran con los pedidos creados", async () => {
    const { data, error } = await rpc(clientStaffA).rpc<ResumenVentas[]>("reporte_ventas", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);

    const r = data![0];
    expect(r.pedidos_total).toBe(ESPERADO.pedidosTotal);
    expect(r.venta_total).toBe(ESPERADO.ventaTotal);
    // División entera de Postgres: trunca. La venta total no es divisible por 3
    // a propósito, para que este assert no pase por casualidad.
    expect(ESPERADO.ventaTotal % 3).not.toBe(0);
    expect(r.ticket_promedio).toBe(ESPERADO.ticketPromedio);
  });

  test("reporte_ventas: los cancelados no suman a venta_total pero sí se cuentan", async () => {
    const { data, error } = await rpc(clientStaffA).rpc<ResumenVentas[]>("reporte_ventas", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });

    expect(error).toBeNull();
    const r = data![0];

    expect(r.pedidos_cancelados).toBe(ESPERADO.pedidosCancelados);
    // El pedido cancelado existe (está en pedidos_total) pero su plata no entra.
    expect(r.pedidos_total).toBe(ESPERADO.pedidosTotal);
    expect(r.venta_total).toBe(ESPERADO.ventaTotal);

    const { data: cancelado } = await adminClient
      .from("pedidos")
      .select("total")
      .eq("local_id", fixtures.localA.id)
      .eq("estado", "cancelado");

    const sumaCancelada = (cancelado ?? []).reduce((acc, p) => acc + p.total, 0);
    expect(sumaCancelada).toBeGreaterThan(0);
    // La venta total más lo cancelado tiene que dar la suma bruta de todo.
    const { data: todos } = await adminClient
      .from("pedidos")
      .select("total")
      .eq("local_id", fixtures.localA.id);
    const sumaBruta = (todos ?? []).reduce((acc, p) => acc + p.total, 0);
    expect(r.venta_total + sumaCancelada).toBe(sumaBruta);
  });

  test("reporte_ventas: separa entregados de pendientes", async () => {
    const { data, error } = await rpc(clientStaffA).rpc<ResumenVentas[]>("reporte_ventas", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });

    expect(error).toBeNull();
    const r = data![0];

    expect(r.pedidos_entregados).toBe(ESPERADO.pedidosEntregados);
    expect(r.venta_entregada).toBe(ESPERADO.ventaEntregada);
    expect(r.pedidos_pendientes).toBe(ESPERADO.pedidosPendientes);
    // pendientes = total - entregados - cancelados
    expect(r.pedidos_pendientes).toBe(
      r.pedidos_total - r.pedidos_entregados - r.pedidos_cancelados
    );
  });

  test("AISLAMIENTO: staff del local B pide el reporte del local A y recibe ceros", async () => {
    const { data, error } = await rpc(clientStaffB).rpc<ResumenVentas[]>("reporte_ventas", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });

    // No debe ser un error: la RLS simplemente no le muestra filas.
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const r = data![0];
    expect(r.pedidos_total).toBe(0);
    expect(r.pedidos_entregados).toBe(0);
    expect(r.pedidos_pendientes).toBe(0);
    expect(r.pedidos_cancelados).toBe(0);
    expect(r.venta_entregada).toBe(0);
    expect(r.venta_total).toBe(0);
    expect(r.ticket_promedio).toBe(0);
  });

  test("AISLAMIENTO: staff del local B no ve el top de productos ni la serie diaria del local A", async () => {
    const { data: top, error: errTop } = await rpc(clientStaffB).rpc<TopProducto[]>(
      "reporte_top_productos",
      { p_local_id: fixtures.localA.id, p_desde: hoy, p_hasta: hoy, p_limite: 10 }
    );

    expect(errTop).toBeNull();
    expect(top).toEqual([]);

    const { data: dias, error: errDias } = await rpc(clientStaffB).rpc<VentaPorDia[]>(
      "reporte_ventas_por_dia",
      { p_local_id: fixtures.localA.id, p_desde: hoy, p_hasta: hoy }
    );

    expect(errDias).toBeNull();
    expect(dias).toEqual([]);
  });

  test("El cliente anónimo no puede ejecutar las RPCs de reportes", async () => {
    const anon = rpc(anonClient as ClienteSupabase);

    const { error: e1 } = await anon.rpc<ResumenVentas[]>("reporte_ventas", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });
    expect(e1).not.toBeNull();

    const { error: e2 } = await anon.rpc<VentaPorDia[]>("reporte_ventas_por_dia", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });
    expect(e2).not.toBeNull();

    const { error: e3 } = await anon.rpc<TopProducto[]>("reporte_top_productos", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
      p_limite: 10,
    });
    expect(e3).not.toBeNull();
  });

  test("reporte_top_productos: ordena por unidades vendidas y excluye cancelados", async () => {
    const { data, error } = await rpc(clientStaffA).rpc<TopProducto[]>("reporte_top_productos", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
      p_limite: 10,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(2);

    const pA = fixtures.localA.prodAvailable;

    // prodExtra: 3 (P2) + 2 (P3) = 5 unidades.
    // prodAvailable: 2 (P1) + 1 (P2) = 3 unidades. El x1 de P4 no cuenta: cancelado.
    const [primero, segundo] = data!;

    expect(primero.producto_id).toBe(prodExtraA.id);
    expect(primero.nombre).toBe(prodExtraA.nombre);
    expect(primero.unidades).toBe(5);
    expect(primero.venta).toBe(prodExtraA.precio * 5);

    expect(segundo.producto_id).toBe(pA.id);
    expect(segundo.nombre).toBe(pA.nombre);
    expect(segundo.unidades).toBe(3);
    expect(segundo.venta).toBe(pA.precio * 3);

    expect(primero.unidades).toBeGreaterThan(segundo.unidades);
    // La suma del top tiene que cuadrar con la venta no cancelada del período.
    expect(primero.venta + segundo.venta).toBe(ESPERADO.ventaTotal);
  });

  test("reporte_top_productos: p_limite recorta el resultado", async () => {
    const { data, error } = await rpc(clientStaffA).rpc<TopProducto[]>("reporte_top_productos", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
      p_limite: 1,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].producto_id).toBe(prodExtraA.id);
  });

  test("reporte_ventas_por_dia: devuelve el día de hoy con los pedidos no cancelados", async () => {
    const { data, error } = await rpc(clientStaffA).rpc<VentaPorDia[]>("reporte_ventas_por_dia", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const dia = data![0];
    expect(dia.dia).toBe(hoy);
    expect(dia.pedidos).toBe(ESPERADO.pedidosTotal - ESPERADO.pedidosCancelados);
    expect(dia.venta).toBe(ESPERADO.ventaTotal);
  });

  test("Rango de fechas sin pedidos: reporte_ventas devuelve ceros, no null ni error", async () => {
    const { data, error } = await rpc(clientStaffA).rpc<ResumenVentas[]>("reporte_ventas", {
      p_local_id: fixtures.localA.id,
      p_desde: "2020-01-01",
      p_hasta: "2020-01-31",
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const r = data![0];
    expect(r.pedidos_total).toBe(0);
    expect(r.pedidos_entregados).toBe(0);
    expect(r.pedidos_pendientes).toBe(0);
    expect(r.pedidos_cancelados).toBe(0);
    expect(r.venta_entregada).toBe(0);
    expect(r.venta_total).toBe(0);
    expect(r.ticket_promedio).toBe(0);
  });

  test("Rango de fechas sin pedidos: las series devuelven arrays vacíos", async () => {
    const { data: dias, error: errDias } = await rpc(clientStaffA).rpc<VentaPorDia[]>(
      "reporte_ventas_por_dia",
      { p_local_id: fixtures.localA.id, p_desde: "2020-01-01", p_hasta: "2020-01-31" }
    );

    expect(errDias).toBeNull();
    expect(dias).toEqual([]);

    const { data: top, error: errTop } = await rpc(clientStaffA).rpc<TopProducto[]>(
      "reporte_top_productos",
      { p_local_id: fixtures.localA.id, p_desde: "2020-01-01", p_hasta: "2020-01-31", p_limite: 10 }
    );

    expect(errTop).toBeNull();
    expect(top).toEqual([]);
  });

  test("Rango inclusivo: [hoy, hoy] captura los pedidos de hoy y [ayer, ayer] no", async () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
      timeZone: "America/Santiago",
    });

    const { data: deHoy } = await rpc(clientStaffA).rpc<ResumenVentas[]>("reporte_ventas", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });
    expect(deHoy![0].pedidos_total).toBe(ESPERADO.pedidosTotal);

    const { data: deAyer } = await rpc(clientStaffA).rpc<ResumenVentas[]>("reporte_ventas", {
      p_local_id: fixtures.localA.id,
      p_desde: ayer,
      p_hasta: ayer,
    });
    expect(deAyer![0].pedidos_total).toBe(0);
  });
});
