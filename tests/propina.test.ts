import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import {
  anonClient,
  adminClient,
  setupTestFixtures,
  cleanupTestFixtures,
  createAuthenticatedClient,
  type TestFixtures,
} from "./setup";

/**
 * F10 — propina sugerida y agregación mensual.
 *
 * La plata NO pasa por la plataforma: la propina es una sugerencia que el local
 * cobra en su caja. Lo que se prueba acá es que el número sea correcto y que no
 * contamine la venta del local, que es plata distinta.
 */
describe("Propina y serie mensual (F10)", () => {
  let fixtures: TestFixtures;
  let clientStaffA: Awaited<ReturnType<typeof createAuthenticatedClient>>;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
    clientStaffA = await createAuthenticatedClient(fixtures.staffA.email, fixtures.staffA.pass);
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  async function crear(propinaPct: number | null, cantidad = 2) {
    const { data, error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Cliente Propina",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localA.prodAvailable.id, cantidad, notas: "" }],
      p_client_request_id: randomUUID(),
      ...(propinaPct === null ? {} : { p_propina_pct: propinaPct }),
    });
    if (error) return { error };
    const { data: pedido } = await adminClient
      .from("pedidos")
      .select("id, total, propina, propina_pct, estado")
      .eq("id", data!)
      .single();
    return { pedido: pedido! };
  }

  const hoyChile = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

  test("La propina se calcula en el SERVIDOR sobre su propio total", async () => {
    const precio = fixtures.localA.prodAvailable.precio;
    const { pedido } = await crear(15, 2);

    expect(pedido!.total).toBe(precio * 2);
    expect(pedido!.propina_pct).toBe(15);
    expect(pedido!.propina).toBe(Math.round(precio * 2 * 0.15));
  });

  test("La propina NO se suma al total del pedido", async () => {
    const precio = fixtures.localA.prodAvailable.precio;
    const { pedido } = await crear(20, 1);

    // `total` es solo la comida. Si la propina se colara acá, todos los reportes
    // de venta quedarían inflados con plata que no es del local.
    expect(pedido!.total).toBe(precio);
    expect(pedido!.propina).toBeGreaterThan(0);
  });

  test("Sin propina explícita, el pedido queda en cero (compatibilidad)", async () => {
    const { pedido } = await crear(null, 1);
    expect(pedido!.propina).toBe(0);
    expect(pedido!.propina_pct).toBe(0);
  });

  test("Un porcentaje fuera de rango se acota en vez de tumbar el pedido", async () => {
    const precio = fixtures.localA.prodAvailable.precio;

    // Perder un pedido real por un porcentaje raro sería peor que cobrar 0.
    const alto = await crear(500, 1);
    expect(alto.error).toBeUndefined();
    expect(alto.pedido!.propina_pct).toBe(100);
    expect(alto.pedido!.propina).toBe(precio);

    const bajo = await crear(-30, 1);
    expect(bajo.error).toBeUndefined();
    expect(bajo.pedido!.propina_pct).toBe(0);
    expect(bajo.pedido!.propina).toBe(0);
  });

  test("El staff no puede modificar la propina de un pedido", async () => {
    const { pedido } = await crear(10, 1);

    // Solo `estado` es actualizable por el staff desde T3.
    await clientStaffA.from("pedidos").update({ propina: 999999 }).eq("id", pedido!.id);

    const { data: despues } = await adminClient
      .from("pedidos")
      .select("propina")
      .eq("id", pedido!.id)
      .single();
    expect(despues!.propina).toBe(pedido!.propina);
  });

  test("reporte_ventas informa las propinas APARTE de la venta", async () => {
    const hoy = hoyChile();
    const { data } = await clientStaffA.rpc("reporte_ventas", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });
    const r = data![0];

    const { data: pedidos } = await adminClient
      .from("pedidos")
      .select("total, propina, estado")
      .eq("local_id", fixtures.localA.id);

    const vivos = (pedidos ?? []).filter((p) => p.estado !== "cancelado");
    const ventaEsperada = vivos.reduce((s, p) => s + p.total, 0);
    const propinaEsperada = vivos.reduce((s, p) => s + p.propina, 0);

    expect(Number(r.venta_total)).toBe(ventaEsperada);
    expect(Number(r.propinas_total)).toBe(propinaEsperada);
    // La propina existe y NO está incluida en la venta.
    expect(propinaEsperada).toBeGreaterThan(0);
    expect(Number(r.venta_total)).not.toBe(ventaEsperada + propinaEsperada);
  });

  test("Un pedido cancelado no aporta su propina al reporte", async () => {
    const { pedido } = await crear(20, 3);
    const hoy = hoyChile();

    const antes = await clientStaffA.rpc("reporte_ventas", {
      p_local_id: fixtures.localA.id, p_desde: hoy, p_hasta: hoy,
    });

    await clientStaffA.from("pedidos").update({ estado: "cancelado" }).eq("id", pedido!.id);

    const despues = await clientStaffA.rpc("reporte_ventas", {
      p_local_id: fixtures.localA.id, p_desde: hoy, p_hasta: hoy,
    });

    expect(Number(despues.data![0].propinas_total)).toBe(
      Number(antes.data![0].propinas_total) - pedido!.propina
    );
  });

  test("La serie mensual cuadra con la diaria", async () => {
    const hoy = hoyChile();
    const desde = `${hoy.slice(0, 4)}-01-01`;

    const [dias, meses] = await Promise.all([
      clientStaffA.rpc("reporte_ventas_por_dia", {
        p_local_id: fixtures.localA.id, p_desde: desde, p_hasta: hoy,
      }),
      clientStaffA.rpc("reporte_ventas_por_mes", {
        p_local_id: fixtures.localA.id, p_desde: desde, p_hasta: hoy,
      }),
    ]);

    const sumaDias = (dias.data ?? []).reduce((s, d) => s + Number(d.venta), 0);
    const sumaMeses = (meses.data ?? []).reduce((s, m) => s + Number(m.venta), 0);

    expect(sumaMeses).toBe(sumaDias);
    expect(sumaMeses).toBeGreaterThan(0);
    // El primer día del mes, como fecha, es lo que la UI usa de clave del gráfico.
    expect(meses.data![0].mes.slice(8, 10)).toBe("01");
  });

  test("AISLAMIENTO: el staff del local B no ve la serie mensual del local A", async () => {
    const clientStaffB = await createAuthenticatedClient(fixtures.staffB.email, fixtures.staffB.pass);
    const hoy = hoyChile();

    const { data, error } = await clientStaffB.rpc("reporte_ventas_por_mes", {
      p_local_id: fixtures.localA.id,
      p_desde: `${hoy.slice(0, 4)}-01-01`,
      p_hasta: hoy,
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("El anónimo no puede ejecutar reporte_ventas_por_mes", async () => {
    const hoy = hoyChile();
    const { error } = await anonClient.rpc("reporte_ventas_por_mes", {
      p_local_id: fixtures.localA.id, p_desde: hoy, p_hasta: hoy,
    });
    expect(error).not.toBeNull();
  });
});
