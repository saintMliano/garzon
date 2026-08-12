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

// ============================================================================
// F8 — Confianza: idempotencia de `crear_pedido` y bitácora de estados.
//
//   supabase/migrations/20260812130411_f8_idempotencia_crear_pedido.sql
//   supabase/migrations/20260812130413_f8_auditoria_estados.sql
//
// Lo que se prueba acá no es "la función devuelve un uuid": es que el comensal
// que toca "Enviar pedido" dos veces en 4G NO le mete dos pedidos a la cocina,
// y que la bitácora que responde "¿quién canceló esto?" no la puede reescribir
// nadie desde la aplicación.
//
// `pedido_eventos` tiene RLS con una única política de SELECT. Sin políticas de
// escritura, PostgREST no devuelve error en UPDATE/DELETE: simplemente no matchea
// ninguna fila y afecta 0. Por eso los asserts de adulteración aceptan las dos
// formas de fallar (error o 0 filas) y después verifican con service-role que la
// fila siguió intacta.
// ============================================================================

type ClienteSupabase = Awaited<ReturnType<typeof createAuthenticatedClient>>;

type EstadoPedido = "nuevo" | "aceptado" | "preparando" | "listo" | "entregado" | "cancelado";

interface FilaTiempos {
  pedidos_medidos: number;
  seg_hasta_aceptado: number;
  seg_hasta_listo: number;
  seg_hasta_entregado: number;
}

/** Fecha de calendario chileno, que es el corte que usan las RPCs de reportes. */
function hoyEnChile(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

describe("F8 — Confianza: idempotencia y auditoría", () => {
  let fixtures: TestFixtures;
  let clientStaffA: ClienteSupabase;
  let clientStaffB: ClienteSupabase;

  const hoy = hoyEnChile();

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
    clientStaffA = await createAuthenticatedClient(fixtures.staffA.email, fixtures.staffA.pass);
    clientStaffB = await createAuthenticatedClient(fixtures.staffB.email, fixtures.staffB.pass);
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /** Checkout anónimo contra el local A. `crid` opcional = intento de checkout. */
  async function crearPedidoA(nombre: string, crid?: string): Promise<string> {
    const { data, error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: nombre,
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localA.prodAvailable.id, cantidad: 1, notas: "" }],
      ...(crid ? { p_client_request_id: crid } : {}),
    });
    if (error || !data) throw new Error(`No se pudo crear "${nombre}": ${error?.message}`);
    return data;
  }

  /** Igual que arriba pero sin lanzar: para el test de reintentos concurrentes. */
  async function intentarPedidoA(
    nombre: string,
    crid: string
  ): Promise<{ id: string | null; mensaje: string | null }> {
    const { data, error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: nombre,
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localA.prodAvailable.id, cantidad: 1, notas: "" }],
      p_client_request_id: crid,
    });
    return { id: data ?? null, mensaje: error?.message ?? null };
  }

  async function crearPedidoB(nombre: string): Promise<string> {
    const { data, error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localB.id,
      p_nombre: nombre,
      p_mesa: "Mesa A",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localB.prodAvailable.id, cantidad: 1, notas: "" }],
    });
    if (error || !data) throw new Error(`No se pudo crear "${nombre}" en B: ${error?.message}`);
    return data;
  }

  async function avanzar(cliente: ClienteSupabase, orderId: string, estado: EstadoPedido) {
    const { error } = await cliente.from("pedidos").update({ estado }).eq("id", orderId);
    if (error) throw new Error(`No se pudo pasar ${orderId} a ${estado}: ${error.message}`);
  }

  /** Cuenta con service-role: la verdad de la base, sin RLS de por medio. */
  async function contarPedidosConCrid(crid: string): Promise<number> {
    const { data, error } = await adminClient
      .from("pedidos")
      .select("id")
      .eq("client_request_id", crid);
    if (error) throw new Error(`Error contando pedidos con crid ${crid}: ${error.message}`);
    return (data ?? []).length;
  }

  /** Eventos de un pedido, en orden cronológico, leídos con service-role. */
  async function eventosDe(orderId: string) {
    const { data, error } = await adminClient
      .from("pedido_eventos")
      .select("id, pedido_id, local_id, estado_anterior, estado_nuevo, actor, created_at")
      .eq("pedido_id", orderId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Error leyendo eventos de ${orderId}: ${error.message}`);
    return data ?? [];
  }

  // ==========================================================================
  // IDEMPOTENCIA
  // ==========================================================================

  test("Idempotencia: dos llamadas con el mismo client_request_id devuelven el mismo pedido", async () => {
    const crid = randomUUID();

    const primero = await crearPedidoA("Idem secuencial", crid);
    const segundo = await crearPedidoA("Idem secuencial", crid);

    expect(segundo).toBe(primero);
    expect(await contarPedidosConCrid(crid)).toBe(1);
  });

  test("Idempotencia: 3 reintentos CONCURRENTES del mismo checkout crean un solo pedido", async () => {
    const crid = randomUUID();

    // El caso que de verdad pasa en un local: el botón tocado dos veces mientras
    // la primera request todavía viaja. Las tres salen juntas, sin await entre medio.
    const resultados = await Promise.all([
      intentarPedidoA("Idem concurrente", crid),
      intentarPedidoA("Idem concurrente", crid),
      intentarPedidoA("Idem concurrente", crid),
    ]);

    // Ninguna debe reventar en la cara del comensal.
    const conError = resultados.filter((r) => r.mensaje !== null);
    expect(conError.map((r) => r.mensaje)).toEqual([]);

    const ids = resultados.map((r) => r.id);
    expect(ids.every((id) => id !== null)).toBe(true);
    expect(new Set(ids).size).toBe(1);

    expect(await contarPedidosConCrid(crid)).toBe(1);
  });

  test("Compatibilidad: sin client_request_id, dos llamadas crean dos pedidos distintos", async () => {
    const p1 = await crearPedidoA("Sin crid 1");
    const p2 = await crearPedidoA("Sin crid 2");

    expect(p1).not.toBe(p2);

    const { data } = await adminClient
      .from("pedidos")
      .select("id, client_request_id")
      .in("id", [p1, p2]);

    expect(data).toHaveLength(2);
    expect((data ?? []).every((p) => p.client_request_id === null)).toBe(true);
  });

  test("Idempotencia: dos client_request_id distintos crean dos pedidos distintos", async () => {
    const cridA = randomUUID();
    const cridB = randomUUID();

    const p1 = await crearPedidoA("Crid distinto 1", cridA);
    const p2 = await crearPedidoA("Crid distinto 2", cridB);

    expect(p1).not.toBe(p2);
    expect(await contarPedidosConCrid(cridA)).toBe(1);
    expect(await contarPedidosConCrid(cridB)).toBe(1);
  });

  test("Idempotencia: el reintento no consume un número de pedido nuevo", async () => {
    const { data: previos } = await adminClient
      .from("pedidos")
      .select("numero_pedido")
      .eq("local_id", fixtures.localA.id)
      .order("numero_pedido", { ascending: false })
      .limit(1);
    const maxAntes = previos?.[0]?.numero_pedido ?? 0;

    const crid = randomUUID();
    const primero = await crearPedidoA("Numero idem", crid);

    const { data: tras1 } = await adminClient
      .from("pedidos")
      .select("numero_pedido")
      .eq("id", primero)
      .single();
    const numeroPrimero = tras1!.numero_pedido;
    expect(numeroPrimero).toBe(maxAntes + 1);

    const segundo = await crearPedidoA("Numero idem", crid);
    expect(segundo).toBe(primero);

    const { data: tras2 } = await adminClient
      .from("pedidos")
      .select("numero_pedido")
      .eq("id", segundo)
      .single();
    expect(tras2!.numero_pedido).toBe(numeroPrimero);

    // Y el correlativo del local no avanzó: el reintento no quemó un número.
    const { data: ahora } = await adminClient
      .from("pedidos")
      .select("numero_pedido")
      .eq("local_id", fixtures.localA.id)
      .order("numero_pedido", { ascending: false })
      .limit(1);
    expect(ahora?.[0]?.numero_pedido).toBe(numeroPrimero);
  });

  // ==========================================================================
  // AUDITORÍA
  // ==========================================================================

  test("Auditoría: crear un pedido deja un evento de creación (anterior NULL -> 'nuevo')", async () => {
    const orderId = await crearPedidoA("Auditoria creacion");

    const eventos = await eventosDe(orderId);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].estado_anterior).toBeNull();
    expect(eventos[0].estado_nuevo).toBe("nuevo");
    expect(eventos[0].local_id).toBe(fixtures.localA.id);
    // Lo creó el comensal anónimo: no hay autor.
    expect(eventos[0].actor).toBeNull();
  });

  test("Auditoría: avanzar el Kanban deja los eventos en orden y con el staff como actor", async () => {
    const orderId = await crearPedidoA("Auditoria transiciones");

    await avanzar(clientStaffA, orderId, "aceptado");
    await avanzar(clientStaffA, orderId, "preparando");

    const eventos = await eventosDe(orderId);
    expect(eventos).toHaveLength(3);

    expect(eventos.map((e) => [e.estado_anterior, e.estado_nuevo])).toEqual([
      [null, "nuevo"],
      ["nuevo", "aceptado"],
      ["aceptado", "preparando"],
    ]);

    // El autor de los cambios es el usuario del staff, no NULL.
    expect(eventos[1].actor).toBe(fixtures.staffA.id);
    expect(eventos[2].actor).toBe(fixtures.staffA.id);

    // Cronología coherente.
    const t = eventos.map((e) => new Date(e.created_at).getTime());
    expect(t[1]).toBeGreaterThanOrEqual(t[0]);
    expect(t[2]).toBeGreaterThanOrEqual(t[1]);
  });

  test("Auditoría: un reintento idempotente no genera eventos nuevos", async () => {
    const crid = randomUUID();

    const primero = await crearPedidoA("Auditoria reintento", crid);
    expect(await eventosDe(primero)).toHaveLength(1);

    const segundo = await crearPedidoA("Auditoria reintento", crid);
    expect(segundo).toBe(primero);

    const eventos = await eventosDe(primero);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].estado_nuevo).toBe("nuevo");
  });

  test("AISLAMIENTO: el staff del local B no ve ningún evento de los pedidos del local A", async () => {
    const orderId = await crearPedidoA("Aislamiento eventos");
    await avanzar(clientStaffA, orderId, "aceptado");

    // Con service-role los eventos existen: lo que sigue mide RLS, no una tabla vacía.
    expect((await eventosDe(orderId)).length).toBeGreaterThanOrEqual(2);

    // El staff A sí los ve.
    const { data: vistaA, error: errA } = await clientStaffA
      .from("pedido_eventos")
      .select("id")
      .eq("pedido_id", orderId);
    expect(errA).toBeNull();
    expect((vistaA ?? []).length).toBeGreaterThanOrEqual(2);

    // El staff B no ve nada de ese pedido...
    const { data: porPedido, error: errB1 } = await clientStaffB
      .from("pedido_eventos")
      .select("id")
      .eq("pedido_id", orderId);
    expect(errB1).toBeNull();
    expect(porPedido).toEqual([]);

    // ...ni nada del local A por ninguna vía.
    const { data: porLocal, error: errB2 } = await clientStaffB
      .from("pedido_eventos")
      .select("id")
      .eq("local_id", fixtures.localA.id);
    expect(errB2).toBeNull();
    expect(porLocal).toEqual([]);

    // Y un select sin filtro tampoco filtra nada del local A.
    const { data: todo, error: errB3 } = await clientStaffB
      .from("pedido_eventos")
      .select("id, local_id");
    expect(errB3).toBeNull();
    expect((todo ?? []).some((e) => e.local_id === fixtures.localA.id)).toBe(false);
  });

  test("La bitácora no se puede adulterar: el staff no puede INSERT, UPDATE ni DELETE", async () => {
    const orderId = await crearPedidoA("Bitacora inviolable");
    const eventos = await eventosDe(orderId);
    expect(eventos).toHaveLength(1);
    const eventoId = eventos[0].id;

    // INSERT: inventar un evento que nunca ocurrió.
    const { data: insertado, error: errInsert } = await clientStaffA
      .from("pedido_eventos")
      .insert({
        pedido_id: orderId,
        local_id: fixtures.localA.id,
        estado_anterior: "nuevo",
        estado_nuevo: "entregado",
        actor: fixtures.staffA.id,
      })
      .select();
    expect(errInsert !== null || (insertado ?? []).length === 0).toBe(true);

    // UPDATE: reescribir quién hizo qué.
    const { data: actualizado, error: errUpdate } = await clientStaffA
      .from("pedido_eventos")
      .update({ estado_nuevo: "cancelado", actor: null })
      .eq("id", eventoId)
      .select();
    expect(errUpdate !== null || (actualizado ?? []).length === 0).toBe(true);

    // DELETE: borrar el rastro.
    const { data: borrado, error: errDelete } = await clientStaffA
      .from("pedido_eventos")
      .delete()
      .eq("id", eventoId)
      .select();
    expect(errDelete !== null || (borrado ?? []).length === 0).toBe(true);

    // La verdad según service-role: el evento sigue ahí, igual, y no apareció otro.
    const finales = await eventosDe(orderId);
    expect(finales).toHaveLength(1);
    expect(finales[0].id).toBe(eventoId);
    expect(finales[0].estado_anterior).toBeNull();
    expect(finales[0].estado_nuevo).toBe("nuevo");
    expect(finales[0].actor).toBeNull();
  });

  test("El cliente anónimo no puede leer pedido_eventos", async () => {
    const orderId = await crearPedidoA("Anon no lee eventos");
    expect((await eventosDe(orderId)).length).toBeGreaterThanOrEqual(1);

    const { data: porPedido, error: e1 } = await anonClient
      .from("pedido_eventos")
      .select("id")
      .eq("pedido_id", orderId);
    expect(e1 !== null || (porPedido ?? []).length === 0).toBe(true);

    const { data: todo, error: e2 } = await anonClient.from("pedido_eventos").select("id");
    expect(e2 !== null || (todo ?? []).length === 0).toBe(true);
  });

  // ==========================================================================
  // TIEMPOS
  // ==========================================================================

  test("reporte_tiempos: mide los pedidos y devuelve segundos coherentes", async () => {
    // Se usa el local B a propósito: acá todos los pedidos recorren la máquina
    // completa, así que las cuatro medianas se calculan sobre el MISMO conjunto
    // y la monotonía (aceptado <= listo <= entregado) está garantizada. En el
    // local A conviven pedidos a medio camino y esa comparación sería frágil.
    const p1 = await crearPedidoB("Tiempos 1");
    const p2 = await crearPedidoB("Tiempos 2");

    for (const id of [p1, p2]) {
      await avanzar(clientStaffB, id, "aceptado");
      await avanzar(clientStaffB, id, "preparando");
      await avanzar(clientStaffB, id, "listo");
      await avanzar(clientStaffB, id, "entregado");
    }

    const { data, error } = await clientStaffB.rpc("reporte_tiempos", {
      p_local_id: fixtures.localB.id,
      p_desde: hoy,
      p_hasta: hoy,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const r = (data as FilaTiempos[])[0];

    expect(r.pedidos_medidos).toBeGreaterThan(0);
    expect(r.pedidos_medidos).toBe(2);

    // Sin asserts sobre magnitudes: los tests corren en milisegundos y las
    // medianas dan 0. Lo que importa es el tipo y el orden entre hitos.
    for (const v of [r.seg_hasta_aceptado, r.seg_hasta_listo, r.seg_hasta_entregado]) {
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(r.seg_hasta_listo).toBeGreaterThanOrEqual(r.seg_hasta_aceptado);
    expect(r.seg_hasta_entregado).toBeGreaterThanOrEqual(r.seg_hasta_listo);

    // Aislamiento de paso: el staff A no ve los tiempos del local B.
    const { data: cruzado, error: errCruzado } = await clientStaffA.rpc("reporte_tiempos", {
      p_local_id: fixtures.localB.id,
      p_desde: hoy,
      p_hasta: hoy,
    });
    expect(errCruzado).toBeNull();
    expect((cruzado as FilaTiempos[])[0].pedidos_medidos).toBe(0);
  });

  test("El cliente anónimo no puede ejecutar reporte_tiempos", async () => {
    const { error } = await anonClient.rpc("reporte_tiempos", {
      p_local_id: fixtures.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });

    expect(error).not.toBeNull();
  });
});
