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
 * Teléfono del comensal — pruebas contra la base real.
 *
 * Acá no se prueba el formateo (eso es `telefono.test.ts`, puro). Se prueba lo
 * que solo la base puede garantizar: que el servidor normaliza aunque el
 * navegador mienta, que un dato personal no se filtra por donde no debe, que el
 * staff no lo puede reescribir, y que el borrado automático borra de verdad.
 * Esa última es la que sostiene la promesa de la política de privacidad.
 */
describe("Teléfono del comensal", () => {
  let fixtures: TestFixtures;
  let clientStaffA: Awaited<ReturnType<typeof createAuthenticatedClient>>;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
    clientStaffA = await createAuthenticatedClient(fixtures.staffA.email, fixtures.staffA.pass);
  });

  afterAll(async () => {
    await cleanupTestFixtures(fixtures);
  });

  async function pedir(opts: { telefono?: string; tipoEntrega?: string } = {}) {
    const { data, error } = await anonClient.rpc("crear_pedido", {
      p_local_id: fixtures.localA.id,
      p_nombre: "Cliente Retiro",
      p_mesa: "",
      p_notas: "",
      p_items: [{ producto_id: fixtures.localA.prodAvailable.id, cantidad: 1, notas: "" }],
      p_client_request_id: randomUUID(),
      p_propina_pct: 0,
      ...(opts.telefono === undefined ? {} : { p_telefono: opts.telefono }),
      ...(opts.tipoEntrega === undefined ? {} : { p_tipo_entrega: opts.tipoEntrega }),
    });
    if (error) return { error };

    const { data: pedido } = await adminClient
      .from("pedidos")
      .select("id, telefono, tipo_entrega, estado")
      .eq("id", data!)
      .single();
    return { pedido: pedido! };
  }

  test("El SERVIDOR normaliza el teléfono, escriba lo que escriba el navegador", async () => {
    // Un cliente malicioso o una versión vieja de la app pueden mandar cualquier
    // forma: en la base tiene que quedar siempre la misma.
    const formas = [
      "+56912345678",
      "56912345678",
      "912345678",
      "0912345678",
      "+56 9 1234 5678",
      "(56) 9-1234.5678",
    ];

    for (const forma of formas) {
      const { pedido, error } = await pedir({ telefono: forma, tipoEntrega: "retiro" });
      expect(error, `falló con "${forma}"`).toBeUndefined();
      expect(pedido!.telefono, `"${forma}" no quedó normalizado`).toBe("+56912345678");
    }
  });

  test("Un teléfono ilegible NO tumba el pedido: se guarda vacío", async () => {
    // Perder una venta real por un número mal tipeado es peor que no poder
    // llamar: el comensal igual va a llegar a buscar su pedido.
    for (const basura of ["322123456", "123", "no soy un telefono", "9999999999999"]) {
      const { pedido, error } = await pedir({ telefono: basura, tipoEntrega: "retiro" });
      expect(error, `"${basura}" tumbó el pedido`).toBeUndefined();
      expect(pedido!.telefono).toBeNull();
      expect(pedido!.estado).toBe("nuevo");
    }
  });

  test("Un fijo no se acepta: el campo existe para avisar por mensaje", async () => {
    const { pedido } = await pedir({ telefono: "+56 32 212 3456", tipoEntrega: "retiro" });
    expect(pedido!.telefono).toBeNull();
  });

  test("El tipo de entrega se acota en vez de fallar", async () => {
    const retiro = await pedir({ tipoEntrega: "retiro" });
    expect(retiro.pedido!.tipo_entrega).toBe("retiro");

    // Las mayúsculas y los espacios sí se toleran: es el mismo valor escrito
    // distinto.
    const mayusculas = await pedir({ tipoEntrega: "  RETIRO  " });
    expect(mayusculas.pedido!.tipo_entrega).toBe("retiro");

    // Cualquier OTRA cosa cae a 'mesa'. La comparación es por igualdad exacta y
    // no por "contiene": si mañana alguien manda "retiro en local" o "delivery",
    // el pedido entra como de mesa en vez de inventar una categoría que la
    // cocina no sabe atender.
    for (const raro of ["delivery", "RETIRO EN LOCAL", "", "drone", "retiros"]) {
      const { pedido, error } = await pedir({ tipoEntrega: raro });
      expect(error, `"${raro}" tumbó el pedido`).toBeUndefined();
      expect(pedido!.tipo_entrega, `"${raro}" no cayó a mesa`).toBe("mesa");
    }
  });

  test("Sin teléfono, un pedido normal sigue funcionando igual", async () => {
    const { pedido, error } = await pedir();
    expect(error).toBeUndefined();
    expect(pedido!.telefono).toBeNull();
    expect(pedido!.tipo_entrega).toBe("mesa");
  });

  test("El staff NO puede reescribir el teléfono ni el tipo de entrega", async () => {
    const { pedido } = await pedir({ telefono: "912345678", tipoEntrega: "retiro" });

    await clientStaffA
      .from("pedidos")
      .update({ telefono: "+56999999999", tipo_entrega: "mesa" })
      .eq("id", pedido!.id);

    const { data: despues } = await adminClient
      .from("pedidos")
      .select("telefono, tipo_entrega")
      .eq("id", pedido!.id)
      .single();
    expect(despues!.telefono).toBe("+56912345678");
    expect(despues!.tipo_entrega).toBe("retiro");
  });

  test("El staff SÍ puede leer el teléfono de sus propios pedidos", async () => {
    // Es el punto de la función: la cocina tiene que poder llamar al que viene.
    const { pedido } = await pedir({ telefono: "912345678", tipoEntrega: "retiro" });

    const { data } = await clientStaffA
      .from("pedidos")
      .select("telefono")
      .eq("id", pedido!.id)
      .single();
    expect(data!.telefono).toBe("+56912345678");
  });

  test("AISLAMIENTO: el staff de otro local no ve el teléfono", async () => {
    const { pedido } = await pedir({ telefono: "912345678", tipoEntrega: "retiro" });
    const clientStaffB = await createAuthenticatedClient(fixtures.staffB.email, fixtures.staffB.pass);

    const { data } = await clientStaffB.from("pedidos").select("telefono").eq("id", pedido!.id);
    expect(data).toEqual([]);
  });

  test("El seguimiento público NO expone el teléfono", async () => {
    // `get_order_status` es la única puerta anónima a un pedido, y quien conoce
    // el UUID no tiene por qué llevarse de regalo el celular de quien pidió.
    const { pedido } = await pedir({ telefono: "912345678", tipoEntrega: "retiro" });

    const { data, error } = await anonClient.rpc("get_order_status", { p_order_id: pedido!.id });
    expect(error).toBeNull();
    expect(data![0]).toBeDefined();
    expect(Object.keys(data![0])).not.toContain("telefono");
    expect(JSON.stringify(data)).not.toContain("912345678");
  });

  test("El anónimo no puede leer pedidos con teléfono directamente", async () => {
    await pedir({ telefono: "912345678", tipoEntrega: "retiro" });
    const { data } = await anonClient.from("pedidos").select("telefono").eq("local_id", fixtures.localA.id);
    expect(data ?? []).toEqual([]);
  });

  test("El borrado automático borra los viejos y respeta los recientes", async () => {
    const { pedido } = await pedir({ telefono: "912345678", tipoEntrega: "retiro" });

    // Con una ventana de un año, un pedido de hace un segundo no se toca.
    const conservados = await adminClient.rpc("borrar_telefonos_antiguos", { p_dias: 365 });
    expect(conservados.error).toBeNull();

    const { data: intacto } = await adminClient
      .from("pedidos").select("telefono").eq("id", pedido!.id).single();
    expect(intacto!.telefono).toBe("+56912345678");

    // Con ventana cero, todo lo anterior a este instante se borra. Es la misma
    // función que corre el agendador a diario, solo que con otro parámetro.
    const borrados = await adminClient.rpc("borrar_telefonos_antiguos", { p_dias: 0 });
    expect(borrados.error).toBeNull();
    expect(Number(borrados.data)).toBeGreaterThan(0);

    const { data: despues } = await adminClient
      .from("pedidos").select("telefono, estado, total").eq("id", pedido!.id).single();

    // El teléfono desaparece; el pedido y su venta quedan para los reportes.
    expect(despues!.telefono).toBeNull();
    expect(despues!.total).toBeGreaterThan(0);
  });

  test("Nadie desde el navegador puede ejecutar el borrado masivo", async () => {
    const anon = await anonClient.rpc("borrar_telefonos_antiguos", { p_dias: 0 });
    expect(anon.error).not.toBeNull();

    const staff = await clientStaffA.rpc("borrar_telefonos_antiguos", { p_dias: 0 });
    expect(staff.error).not.toBeNull();
  });

  describe("Bitácora de supresiones", () => {
    const creadas: string[] = [];

    afterAll(async () => {
      // La tabla es de producción: lo que siembre un test se lo lleva el test.
      if (creadas.length) {
        await adminClient.from("supresiones_telefono").delete().in("id", creadas);
      }
    });

    test("La base RECHAZA guardar el número completo en la constancia", async () => {
      // Es el corazón del diseño: si la constancia pudiera contener el teléfono,
      // "borrar" sería mudar el dato de tabla. El CHECK lo impide aunque el
      // código de la aplicación se equivoque.
      const { error } = await adminClient.from("supresiones_telefono").insert({
        telefono_enmascarado: "+56912345678",
        pedidos_afectados: 1,
      });
      expect(error).not.toBeNull();
    });

    test("Sí acepta el enmascarado", async () => {
      const { data, error } = await adminClient
        .from("supresiones_telefono")
        .insert({ telefono_enmascarado: "+56 9 ---- 5678", pedidos_afectados: 3 })
        .select("id")
        .single();
      expect(error).toBeNull();
      if (data) creadas.push(data.id);
    });

    test("Nadie desde el navegador la lee ni la escribe", async () => {
      // RLS activada y sin políticas: ni el anónimo ni una sesión de staff.
      const { data: anonLee } = await anonClient.from("supresiones_telefono").select("id");
      expect(anonLee ?? []).toEqual([]);

      const { data: staffLee } = await clientStaffA.from("supresiones_telefono").select("id");
      expect(staffLee ?? []).toEqual([]);

      const { error: staffEscribe } = await clientStaffA
        .from("supresiones_telefono")
        .insert({ telefono_enmascarado: "+56 9 ---- 0000", pedidos_afectados: 0 });
      expect(staffEscribe).not.toBeNull();
    });
  });

});
