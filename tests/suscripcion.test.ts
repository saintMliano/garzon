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
import { DIAS_GRACIA, DIAS_PRUEBA } from "@/lib/suscripcion";

/**
 * F10 — suscripción por local.
 *
 * La plata no pasa por la plataforma: el local paga por fuera y acá solo se
 * registra hasta cuándo está al día. Lo que se prueba es la parte peligrosa:
 * que el corte lo haga el SERVIDOR, que llegue recién después de la gracia, que
 * el comensal no se entere del motivo, y que un local no pueda prorrogarse solo.
 */
describe("Suscripción y corte de pedidos (F10)", () => {
  let fixtures: TestFixtures;
  let clientStaffA: Awaited<ReturnType<typeof createAuthenticatedClient>>;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
    clientStaffA = await createAuthenticatedClient(fixtures.staffA.email, fixtures.staffA.pass);
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  const hoyChile = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

  function fechaRelativa(dias: number): string {
    const [a, m, d] = hoyChile().split("-").map(Number);
    const base = new Date(Date.UTC(a, m - 1, d));
    base.setUTCDate(base.getUTCDate() + dias);
    return base.toISOString().slice(0, 10);
  }

  /** Deja el local A en un estado de suscripción dado (solo el service-role puede). */
  async function ponerSuscripcion(estado: string, hasta: string | null) {
    const { error } = await adminClient
      .from("locales")
      .update({ suscripcion_estado: estado, suscripcion_hasta: hasta })
      .eq("id", fixtures.localA.id);
    if (error) throw new Error(`No se pudo fijar la suscripción: ${error.message}`);
  }

  async function pedir(clientRequestId = randomUUID()) {
    return anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Cliente Suscripción",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localA.prodAvailable.id, cantidad: 1, notas: "" }],
      p_client_request_id: clientRequestId,
    });
  }

  test("Un local nuevo sin fecha registrada puede vender (falla hacia abierto)", async () => {
    // Pausar a un local que sí pagó, por un dato ausente, es peor que regalarle
    // días a uno que no pagó.
    const { data: local } = await adminClient
      .from("locales")
      .select("suscripcion_estado, suscripcion_hasta")
      .eq("id", fixtures.localA.id)
      .single();
    expect(local!.suscripcion_estado).toBe("prueba");
    expect(local!.suscripcion_hasta).toBeNull();

    const { error } = await pedir();
    expect(error).toBeNull();
  });

  test("Vencida pero dentro de los 7 días de gracia: SIGUE recibiendo pedidos", async () => {
    await ponerSuscripcion("activa", fechaRelativa(-7));
    const { error } = await pedir();
    expect(error).toBeNull();
  });

  test("Pasada la gracia, el SERVIDOR rechaza el pedido", async () => {
    await ponerSuscripcion("activa", fechaRelativa(-8));
    const { data, error } = await pedir();
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  test("El mensaje al comensal no revela que el local no pagó", async () => {
    await ponerSuscripcion("activa", fechaRelativa(-30));
    const { error } = await pedir();
    const msg = (error?.message ?? "").toLowerCase();

    expect(msg).toContain("no está recibiendo pedidos");
    for (const palabra of ["suscrip", "pago", "pagó", "deuda", "moroso", "vencid"]) {
      expect(msg).not.toContain(palabra);
    }
  });

  test("Cortesía nunca se pausa, por vieja que sea la fecha", async () => {
    await ponerSuscripcion("cortesia", fechaRelativa(-900));
    const { error } = await pedir();
    expect(error).toBeNull();
  });

  test("Cancelada se pausa aunque la fecha esté en el futuro", async () => {
    await ponerSuscripcion("cancelada", fechaRelativa(365));
    const { error } = await pedir();
    expect(error).not.toBeNull();
  });

  test("Un pedido ya creado se devuelve aunque el local se pause después", async () => {
    // La idempotencia manda sobre el corte: si la cocina ya lo está preparando,
    // dejar al comensal reintentando sería peor que servir un pedido de más.
    await ponerSuscripcion("activa", fechaRelativa(30));
    const clave = randomUUID();
    const { data: primero, error: errPrimero } = await pedir(clave);
    expect(errPrimero).toBeNull();

    await ponerSuscripcion("cancelada", null);
    const { data: repetido, error: errRepetido } = await pedir(clave);

    expect(errRepetido).toBeNull();
    expect(repetido).toBe(primero);
  });

  test("Con los pedidos en pausa, la carta se sigue viendo", async () => {
    await ponerSuscripcion("activa", fechaRelativa(-30));
    const { data } = await anonClient.rpc("get_menu_publico", { p_slug: fixtures.localA.slug });
    const menu = data as unknown as {
      local: Record<string, unknown>;
      productos: unknown[];
    };

    // Un 404 haría ver el QR como roto; la carta es la vitrina del local.
    expect(menu).not.toBeNull();
    expect(menu.productos.length).toBeGreaterThan(0);
    expect(menu.local.pedidos_habilitados).toBe(false);
  });

  test("El menú público no filtra NADA de la suscripción", async () => {
    const { data } = await anonClient.rpc("get_menu_publico", { p_slug: fixtures.localA.slug });
    const claves = Object.keys((data as unknown as { local: object }).local);

    for (const prohibida of [
      "suscripcion_estado",
      "suscripcion_hasta",
      "suscripcion_notas",
      "plan",
      "activo",
      "limite_pedidos_min",
    ]) {
      expect(claves).not.toContain(prohibida);
    }
  });

  test("El staff NO puede prorrogarse la suscripción", async () => {
    await ponerSuscripcion("activa", fechaRelativa(-30));

    await clientStaffA
      .from("locales")
      .update({ suscripcion_hasta: fechaRelativa(3650) })
      .eq("id", fixtures.localA.id);

    const { data: despues } = await adminClient
      .from("locales")
      .select("suscripcion_hasta")
      .eq("id", fixtures.localA.id)
      .single();
    expect(despues!.suscripcion_hasta).toBe(fechaRelativa(-30));

    // Y sigue cortado de verdad, no solo en la columna.
    const { error } = await pedir();
    expect(error).not.toBeNull();
  });

  test("El staff NO puede pasarse a cortesía", async () => {
    await ponerSuscripcion("activa", fechaRelativa(-30));

    await clientStaffA
      .from("locales")
      .update({ suscripcion_estado: "cortesia" })
      .eq("id", fixtures.localA.id);

    const { data: despues } = await adminClient
      .from("locales")
      .select("suscripcion_estado")
      .eq("id", fixtures.localA.id)
      .single();
    expect(despues!.suscripcion_estado).toBe("activa");
  });

  test("El dueño ve su propia situación con los días que le quedan", async () => {
    await ponerSuscripcion("activa", fechaRelativa(3));

    const { data, error } = await clientStaffA.rpc("estado_suscripcion", {
      p_local_id: fixtures.localA.id,
    });
    expect(error).toBeNull();

    const estado = data![0];
    expect(estado.situacion).toBe("por_vencer");
    expect(estado.dias_restantes).toBe(3);
    expect(estado.pedidos_habilitados).toBe(true);
    expect(estado.plan).toBe("pro");
  });

  test("AISLAMIENTO: el staff del local B no ve la suscripción del local A", async () => {
    const clientStaffB = await createAuthenticatedClient(fixtures.staffB.email, fixtures.staffB.pass);
    const { data, error } = await clientStaffB.rpc("estado_suscripcion", {
      p_local_id: fixtures.localA.id,
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("La gracia que promete la app es exactamente la que aplica la base", async () => {
    // `DIAS_GRACIA` vive en TypeScript porque el dashboard tiene que decirle al
    // dueño cuántos días le quedan; la regla que corta vive en Postgres. Si las
    // dos se separan, la pantalla promete un plazo que el servidor no respeta.
    const ultimoDiaDeGracia = await adminClient.rpc("situacion_suscripcion", {
      p_estado: "activa",
      p_hasta: fechaRelativa(-DIAS_GRACIA),
    });
    const primerDiaPausado = await adminClient.rpc("situacion_suscripcion", {
      p_estado: "activa",
      p_hasta: fechaRelativa(-DIAS_GRACIA - 1),
    });

    expect(ultimoDiaDeGracia.data).toBe("gracia");
    expect(primerDiaPausado.data).toBe("pausada");
  });

  test("Un local nuevo queda con la prueba que promete el material de venta", async () => {
    // No se llama al endpoint de alta (necesita sesión de super-admin), pero sí
    // se fija la cifra: la exposición máxima sin cobrar es prueba + gracia.
    expect(DIAS_PRUEBA).toBe(7);
    expect(DIAS_PRUEBA + DIAS_GRACIA).toBe(14);

    await ponerSuscripcion("prueba", fechaRelativa(DIAS_PRUEBA));
    const { data } = await clientStaffA.rpc("estado_suscripcion", {
      p_local_id: fixtures.localA.id,
    });
    expect(data![0].situacion).toBe("por_vencer");
    expect(data![0].pedidos_habilitados).toBe(true);
  });

  test("El anónimo no puede consultar el estado de suscripción de nadie", async () => {
    const { error } = await anonClient.rpc("estado_suscripcion", {
      p_local_id: fixtures.localA.id,
    });
    expect(error).not.toBeNull();
  });
});
