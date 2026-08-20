import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  adminClient,
  anonClient,
  setupTestFixtures,
  cleanupTestFixtures,
  createAuthenticatedClient,
  type TestFixtures,
} from "./setup";

/**
 * F12 — Roles por local.
 *
 * Estos tests son el motivo por el que la funcionalidad se puede vender: no
 * comprueban que el menú de navegación esconda un link (eso es cosmético),
 * comprueban que la BASE le diga que no a un `personal` que llame la API
 * directo, que es lo que haría cualquiera con la consola del navegador
 * abierta.
 *
 * Ver supabase/migrations/20260820120000_f12_roles_local.sql.
 */
describe("Roles por local (F12)", () => {
  let fx: TestFixtures;

  // Una tercera cuenta: `personal` del local A.
  let personal: { id: string; email: string; pass: string };
  let clientePersonal: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let clienteDueno: Awaited<ReturnType<typeof createAuthenticatedClient>>;

  const hoy = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    fx = await setupTestFixtures();

    const ts = Date.now();
    const email = `test-personal-${ts}-${Math.random().toString(36).slice(2, 7)}@test.garzon`;
    const pass = `PassP-${ts}!`;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: pass,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`No se pudo crear el personal: ${error?.message}`);
    personal = { id: data.user.id, email, pass };

    const { error: errStaff } = await adminClient
      .from("local_staff")
      .insert({ user_id: personal.id, local_id: fx.localA.id, rol: "personal" });
    if (errStaff) throw new Error(`No se pudo vincular el personal: ${errStaff.message}`);

    clientePersonal = await createAuthenticatedClient(personal.email, personal.pass);
    clienteDueno = await createAuthenticatedClient(fx.staffA.email, fx.staffA.pass);
  }, 60000);

  afterAll(async () => {
    await adminClient.from("local_staff").delete().eq("user_id", personal.id);
    await adminClient.auth.admin.deleteUser(personal.id);
    await cleanupTestFixtures(fx);
  }, 60000);

  // ------------------------------------------------------------------
  // Lo que NO se le puede romper a nadie: los locales que ya existían
  // ------------------------------------------------------------------
  test("Las filas que existían antes de la migración quedaron como dueño", async () => {
    // El DEFAULT de la columna es lo único que impide que un local en
    // producción amanezca sin administrador.
    const { data } = await adminClient
      .from("local_staff")
      .select("rol")
      .eq("user_id", fx.staffA.id)
      .single();
    expect(data?.rol).toBe("dueño");
  });

  test("El rol solo acepta los dos valores definidos", async () => {
    const { error } = await adminClient
      .from("local_staff")
      .update({ rol: "superadmin" })
      .eq("user_id", personal.id);
    expect(error, "el CHECK debería rechazar un rol inventado").not.toBeNull();
  });

  // ------------------------------------------------------------------
  // El menú es del dueño
  // ------------------------------------------------------------------
  test("El personal NO puede cambiar el precio de un producto", async () => {
    await clientePersonal.from("productos").update({ precio: 1 }).eq("id", fx.localA.prodAvailable.id);

    // La RLS no devuelve error en un UPDATE que no matchea filas: devuelve 0
    // filas. Se comprueba el efecto, no el error.
    const { data } = await adminClient
      .from("productos")
      .select("precio")
      .eq("id", fx.localA.prodAvailable.id)
      .single();
    expect(data?.precio, "el personal cambió un precio").toBe(fx.localA.prodAvailable.precio);
  });

  test("El personal NO puede crear ni borrar productos y categorías", async () => {
    const { error: errIns } = await clientePersonal.from("productos").insert({
      local_id: fx.localA.id,
      categoria_id: fx.localA.catId,
      nombre: "Producto pirata",
      precio: 999,
      disponible: true,
      orden: 99,
    });
    expect(errIns, "el personal insertó un producto").not.toBeNull();

    await clientePersonal.from("categorias").delete().eq("id", fx.localA.catId);
    const { data: cat } = await adminClient
      .from("categorias")
      .select("id")
      .eq("id", fx.localA.catId)
      .maybeSingle();
    expect(cat, "el personal borró una categoría").not.toBeNull();
  });

  test("El personal NO puede cambiar la identidad del local", async () => {
    await clientePersonal
      .from("locales")
      .update({ nombre: "Local secuestrado" })
      .eq("id", fx.localA.id);

    const { data } = await adminClient
      .from("locales")
      .select("nombre")
      .eq("id", fx.localA.id)
      .single();
    expect(data?.nombre, "el personal renombró el local").toBe(fx.localA.nombre);
  });

  test("El dueño SÍ sigue pudiendo editar su menú", async () => {
    // La contracara: de nada sirve cerrar si de paso se cierra al dueño.
    const { error } = await clienteDueno
      .from("productos")
      .update({ precio: fx.localA.prodAvailable.precio })
      .eq("id", fx.localA.prodAvailable.id);
    expect(error).toBeNull();

    const { error: errLocal } = await clienteDueno
      .from("locales")
      .update({ nombre: fx.localA.nombre })
      .eq("id", fx.localA.id);
    expect(errLocal).toBeNull();
  });

  // ------------------------------------------------------------------
  // "Se acabó el lomito": la excepción, y que sea SOLO la excepción
  // ------------------------------------------------------------------
  test("El personal SÍ puede marcar un producto como agotado", async () => {
    const { error } = await clientePersonal.rpc("marcar_disponibilidad", {
      p_producto_id: fx.localA.prodAvailable.id,
      p_disponible: false,
    });
    expect(error).toBeNull();

    const { data } = await adminClient
      .from("productos")
      .select("disponible")
      .eq("id", fx.localA.prodAvailable.id)
      .single();
    expect(data?.disponible).toBe(false);

    // Y lo devuelve a disponible para no ensuciar los tests que siguen.
    await clientePersonal.rpc("marcar_disponibilidad", {
      p_producto_id: fx.localA.prodAvailable.id,
      p_disponible: true,
    });
  });

  test("El personal puede REPONER lo que agotó (no es de una sola dirección)", async () => {
    // La primera versión de la comanda sacaba el producto de la grilla al
    // agotarlo, así que un toque por error lo borraba de la carta pública sin
    // forma de volver atrás desde esa pantalla. La RPC siempre pudo hacer las
    // dos cosas; lo que faltaba era poder pedirlo.
    await clientePersonal.rpc("marcar_disponibilidad", {
      p_producto_id: fx.localA.prodAvailable.id,
      p_disponible: false,
    });
    const { error } = await clientePersonal.rpc("marcar_disponibilidad", {
      p_producto_id: fx.localA.prodAvailable.id,
      p_disponible: true,
    });
    expect(error).toBeNull();

    const { data } = await adminClient
      .from("productos")
      .select("disponible")
      .eq("id", fx.localA.prodAvailable.id)
      .single();
    expect(data?.disponible, "el personal no pudo reponer lo que agotó").toBe(true);
  });

  test("Lo que agota el personal desaparece de la carta del comensal, y vuelve al reponerlo", async () => {
    // Es la promesa que se le hace al dueño: el garzón marca que se acabó la
    // palta y el cliente deja de verla, sin que el dueño toque nada.
    type MenuPublico = { productos: { id: string }[] };
    const pedirMenu = async () => {
      const { data } = await (anonClient as unknown as {
        rpc<T>(n: string, a: Record<string, unknown>): PromiseLike<{ data: T | null }>;
      }).rpc<MenuPublico>("get_menu_publico", { p_slug: fx.localA.slug });
      return (data?.productos ?? []).map((p) => p.id);
    };

    expect(await pedirMenu()).toContain(fx.localA.prodAvailable.id);

    await clientePersonal.rpc("marcar_disponibilidad", {
      p_producto_id: fx.localA.prodAvailable.id,
      p_disponible: false,
    });
    expect(
      await pedirMenu(),
      "el comensal sigue viendo un producto que la cocina dio por agotado"
    ).not.toContain(fx.localA.prodAvailable.id);

    await clientePersonal.rpc("marcar_disponibilidad", {
      p_producto_id: fx.localA.prodAvailable.id,
      p_disponible: true,
    });
    expect(await pedirMenu(), "reponerlo no lo devolvió a la carta").toContain(
      fx.localA.prodAvailable.id
    );
  });

  test("marcar_disponibilidad NO deja tocar productos de otro local", async () => {
    const { error } = await clientePersonal.rpc("marcar_disponibilidad", {
      p_producto_id: fx.localB.prodAvailable.id,
      p_disponible: false,
    });
    expect(error, "el personal del local A apagó un producto del local B").not.toBeNull();
  });

  test("El comensal anónimo no puede marcar nada como agotado", async () => {
    const { error } = await anonClient.rpc("marcar_disponibilidad", {
      p_producto_id: fx.localA.prodAvailable.id,
      p_disponible: false,
    });
    expect(error).not.toBeNull();
  });

  // ------------------------------------------------------------------
  // La caja es del dueño — las CINCO funciones, no tres
  // ------------------------------------------------------------------
  const REPORTES = [
    "reporte_ventas",
    "reporte_ventas_por_dia",
    "reporte_ventas_por_mes",
    "reporte_top_productos",
    "reporte_tiempos",
  ] as const;

  test.each(REPORTES)("El personal NO puede ejecutar %s", async (fn) => {
    const { error } = await clientePersonal.rpc(fn, {
      p_local_id: fx.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });
    expect(error, `${fn} le respondió al personal`).not.toBeNull();
  });

  test.each(REPORTES)("El dueño SÍ puede ejecutar %s", async (fn) => {
    const { error } = await clienteDueno.rpc(fn, {
      p_local_id: fx.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });
    expect(error, `${fn} dejó afuera al dueño`).toBeNull();
  });

  test("La guarda de rol NO cambió el aislamiento entre locales", async () => {
    // Contrato viejo que no se puede romper: el staff del local B pidiendo el
    // reporte del local A recibe CEROS, no un error. Ese aislamiento lo hace la
    // RLS y sigue siendo su trabajo; el rol es un control aparte.
    const clienteB = await createAuthenticatedClient(fx.staffB.email, fx.staffB.pass);
    const { data, error } = await clienteB.rpc("reporte_ventas", {
      p_local_id: fx.localA.id,
      p_desde: hoy,
      p_hasta: hoy,
    });
    expect(error).toBeNull();
    const fila = Array.isArray(data) ? data[0] : data;
    expect(fila?.pedidos_total).toBe(0);
  });

  // ------------------------------------------------------------------
  // Lo que el personal SÍ tiene que poder hacer
  // ------------------------------------------------------------------
  test("El personal ve los pedidos de su local y puede avanzarlos y cancelarlos", async () => {
    const { data: pedidoId, error: errCrear } = await anonClient.rpc("crear_pedido", {
      p_local_id: fx.localA.id,
      p_nombre: "Mesa 1",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fx.localA.prodAvailable.id, cantidad: 1 }],
      p_client_request_id: crypto.randomUUID(),
    });
    expect(errCrear).toBeNull();

    const { data: visto } = await clientePersonal
      .from("pedidos")
      .select("id, estado")
      .eq("id", pedidoId as string)
      .maybeSingle();
    expect(visto, "el personal no ve los pedidos de su propio local").not.toBeNull();

    const { error: errAvanzar } = await clientePersonal
      .from("pedidos")
      .update({ estado: "aceptado" })
      .eq("id", pedidoId as string);
    expect(errAvanzar).toBeNull();

    const { error: errCancelar } = await clientePersonal
      .from("pedidos")
      .update({ estado: "cancelado" })
      .eq("id", pedidoId as string);
    expect(errCancelar, "el personal no pudo cancelar y la decisión fue que sí puede").toBeNull();
  });

  test("productos_frecuentes responde al personal y NO devuelve plata", async () => {
    const { data, error } = await clientePersonal.rpc("productos_frecuentes", {
      p_local_id: fx.localA.id,
    });
    expect(error).toBeNull();

    // El motivo de que esta RPC exista en vez de reusar reporte_top_productos:
    // aquella devuelve `venta`, y quien usa la comanda es justamente a quien le
    // estamos cerrando la caja.
    const filas = (data ?? []) as Array<Record<string, unknown>>;
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual(["producto_id", "unidades"]);
    }
  });

  test("productos_frecuentes NO responde a otro local ni al anónimo", async () => {
    const { error: errOtro } = await clientePersonal.rpc("productos_frecuentes", {
      p_local_id: fx.localB.id,
    });
    expect(errOtro).not.toBeNull();

    const { error: errAnon } = await anonClient.rpc("productos_frecuentes", {
      p_local_id: fx.localA.id,
    });
    expect(errAnon).not.toBeNull();
  });

  // ------------------------------------------------------------------
  // Nadie se asciende solo
  // ------------------------------------------------------------------
  test("El personal NO puede ascenderse a dueño", async () => {
    await clientePersonal
      .from("local_staff")
      .update({ rol: "dueño" })
      .eq("user_id", personal.id)
      .eq("local_id", fx.localA.id);

    const { data } = await adminClient
      .from("local_staff")
      .select("rol")
      .eq("user_id", personal.id)
      .eq("local_id", fx.localA.id)
      .single();
    expect(data?.rol, "el personal se ascendió solo").toBe("personal");
  });

  // ------------------------------------------------------------------
  // Un local nunca se queda sin dueño
  // ------------------------------------------------------------------
  test("El último dueño no puede degradarse a sí mismo", async () => {
    // El caso real: el dueño se pone en `personal` para ver cómo lo ve su
    // garzón, y a partir de ahí nadie puede volver a ascenderlo.
    const { error } = await adminClient
      .from("local_staff")
      .update({ rol: "personal" })
      .eq("user_id", fx.staffA.id)
      .eq("local_id", fx.localA.id);

    expect(error, "se pudo dejar el local sin dueño").not.toBeNull();

    const { data } = await adminClient
      .from("local_staff")
      .select("rol")
      .eq("user_id", fx.staffA.id)
      .eq("local_id", fx.localA.id)
      .single();
    expect(data?.rol).toBe("dueño");
  });

  test("Al último dueño tampoco se lo puede sacar del local", async () => {
    const { error } = await adminClient
      .from("local_staff")
      .delete()
      .eq("user_id", fx.staffA.id)
      .eq("local_id", fx.localA.id);
    expect(error, "se pudo borrar al único dueño").not.toBeNull();
  });

  test("Con dos dueños, uno sí puede degradarse", async () => {
    // La contracara: el candado no puede ser tan rígido que impida el relevo.
    await adminClient
      .from("local_staff")
      .update({ rol: "dueño" })
      .eq("user_id", personal.id)
      .eq("local_id", fx.localA.id);

    const { error } = await adminClient
      .from("local_staff")
      .update({ rol: "personal" })
      .eq("user_id", fx.staffA.id)
      .eq("local_id", fx.localA.id);
    expect(error, "con dos dueños el relevo debería poder hacerse").toBeNull();

    // Se deja todo como estaba para los tests que siguen.
    await adminClient
      .from("local_staff")
      .update({ rol: "dueño" })
      .eq("user_id", fx.staffA.id)
      .eq("local_id", fx.localA.id);
    await adminClient
      .from("local_staff")
      .update({ rol: "personal" })
      .eq("user_id", personal.id)
      .eq("local_id", fx.localA.id);
  });

  // ------------------------------------------------------------------
  // La comanda: una nota por línea, no un párrafo al final
  // ------------------------------------------------------------------
  test("Dos líneas del mismo producto llegan con su propia nota cada una", async () => {
    // "Dos italianos, uno sin mayo" es el caso de todos los días. La primera
    // versión de la comanda tenía un carrito de {producto: cantidad}, así que
    // no podía expresarlo. `pedido_items` no tiene índice único por
    // (pedido_id, producto_id), así que la base lo aguanta sin cambios.
    const { data: pedidoId, error } = await clientePersonal.rpc("crear_pedido", {
      p_local_id: fx.localA.id,
      p_nombre: "Mesa 5",
      p_mesa: "Mesa 5",
      p_notas: "",
      p_items: [
        { producto_id: fx.localA.prodAvailable.id, cantidad: 1, notas: "sin ají" },
        { producto_id: fx.localA.prodAvailable.id, cantidad: 2, notas: null },
      ],
      p_client_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();

    const { data: items } = await adminClient
      .from("pedido_items")
      .select("cantidad, notas")
      .eq("pedido_id", pedidoId as string);

    expect(items, "el mismo producto en dos líneas se colapsó en una").toHaveLength(2);

    const conNota = items?.find((i) => i.notas === "sin ají");
    const sinNota = items?.find((i) => i.notas === null);
    expect(conNota?.cantidad).toBe(1);
    expect(sinNota?.cantidad).toBe(2);
  });

  test("El total lo sigue calculando el servidor, la nota no lo altera", async () => {
    // La nota es texto libre del garzón: no puede tocar la plata.
    const { data: pedidoId } = await clientePersonal.rpc("crear_pedido", {
      p_local_id: fx.localA.id,
      p_nombre: "Mesa 6",
      p_mesa: "Mesa 6",
      p_notas: "",
      p_items: [{ producto_id: fx.localA.prodAvailable.id, cantidad: 2, notas: "sin mayo" }],
      p_client_request_id: crypto.randomUUID(),
    });

    const { data: pedido } = await adminClient
      .from("pedidos")
      .select("total")
      .eq("id", pedidoId as string)
      .single();
    expect(pedido?.total).toBe(fx.localA.prodAvailable.precio * 2);
  });

  // ------------------------------------------------------------------
  // Atribución
  // ------------------------------------------------------------------
  test("Un pedido del comensal queda sin autor; uno del personal queda atribuido", async () => {
    const { data: idAnon } = await anonClient.rpc("crear_pedido", {
      p_local_id: fx.localA.id,
      p_nombre: "Comensal",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fx.localA.prodAvailable.id, cantidad: 1 }],
      p_client_request_id: crypto.randomUUID(),
    });

    const { data: idStaff } = await clientePersonal.rpc("crear_pedido", {
      p_local_id: fx.localA.id,
      p_nombre: "Mesa 2",
      p_mesa: "Mesa 2",
      p_notas: "",
      p_items: [{ producto_id: fx.localA.prodAvailable.id, cantidad: 1 }],
      p_client_request_id: crypto.randomUUID(),
    });

    const { data: filas } = await adminClient
      .from("pedidos")
      .select("id, creado_por")
      .in("id", [idAnon as string, idStaff as string]);

    const delComensal = filas?.find((f) => f.id === idAnon);
    const delPersonal = filas?.find((f) => f.id === idStaff);

    expect(delComensal?.creado_por, "un pedido anónimo no debería tener autor").toBeNull();
    expect(delPersonal?.creado_por, "el pedido del personal quedó sin atribuir").toBe(personal.id);
  });

  test("El staff NO puede reescribir quién tomó un pedido", async () => {
    const { data: id } = await clientePersonal.rpc("crear_pedido", {
      p_local_id: fx.localA.id,
      p_nombre: "Mesa 3",
      p_mesa: "Mesa 1",
      p_notas: "",
      p_items: [{ producto_id: fx.localA.prodAvailable.id, cantidad: 1 }],
      p_client_request_id: crypto.randomUUID(),
    });

    await clienteDueno
      .from("pedidos")
      .update({ creado_por: fx.staffA.id })
      .eq("id", id as string);

    const { data } = await adminClient
      .from("pedidos")
      .select("creado_por")
      .eq("id", id as string)
      .single();
    expect(data?.creado_por, "se pudo reescribir la atribución").toBe(personal.id);
  });
});
