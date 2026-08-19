/**
 * Generador de datos demo históricos para el local `el-lalo`.
 *
 * POR QUÉ: los reportes, el ticket promedio, el top de productos y los tiempos
 * de cocina no se pueden apreciar con 9 pedidos en toda la base. Esto genera un
 * año de historia verosímil para poder mostrar el producto funcionando.
 *
 * MARCADO Y REVERSIBILIDAD: todo pedido generado lleva `client_request_id` con
 * el prefijo `de70de70-`. Ese es el marcador — permite borrar exactamente lo
 * sembrado sin tocar un solo pedido real.
 *
 * Uso:
 *   node scripts/sembrar-demo.mjs                      # dry-run: qué haría
 *   node scripts/sembrar-demo.mjs --sembrar --dias=30  # genera 30 días
 *   node scripts/sembrar-demo.mjs --borrar             # borra TODO lo demo
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const SLUG = "el-lalo";
const PREFIJO = "de70de70";
const LOTE = 500;

// `client_request_id` es de tipo uuid y Postgres no tiene LIKE para uuid. Como
// los uuid sí están ordenados, el prefijo se consulta como un RANGO: todo lo
// que empieza con `de70de70-` cae entre estos dos extremos. Además usa el
// índice, a diferencia de un cast a texto.
const DESDE_UUID = `${PREFIJO}-0000-0000-0000-000000000000`;
const HASTA_UUID = "de70de71-0000-0000-0000-000000000000";
const soloDemo = (q) => q.gte("client_request_id", DESDE_UUID).lt("client_request_id", HASTA_UUID);

const args = process.argv.slice(2);
const sembrar = args.includes("--sembrar");
const borrar = args.includes("--borrar");
const dias = Number((args.find((a) => a.startsWith("--dias=")) ?? "--dias=365").split("=")[1]);

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// ============================================================
// Aleatoriedad determinista: la misma semilla produce la misma base demo, así
// que una regeneración no cambia las cifras que uno acaba de mostrarle a alguien.
// ============================================================
let semilla = 20260812;
function rnd() {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const elegir = (arr) => arr[Math.floor(rnd() * arr.length)];

const NOMBRES = [
  "Camila", "Matías", "Valentina", "Benjamín", "Josefa", "Vicente", "Antonia", "Martín",
  "Florencia", "Agustín", "Isidora", "Tomás", "Catalina", "Joaquín", "Emilia", "Diego",
  "Javiera", "Sebastián", "Constanza", "Felipe", "Fernanda", "Cristóbal", "Trinidad", "Ignacio",
  "Rocío", "Nicolás", "Paula", "Rodrigo", "Daniela", "Andrés", "Macarena", "Pablo",
];

/** Multiplicador de flujo por día de la semana (0 = domingo). */
const FACTOR_DIA = [1.2, 0.7, 0.8, 0.85, 0.95, 1.7, 1.75];

/** Porcentajes de propina y su frecuencia relativa. El 10% es el de referencia. */
const PROPINAS = [0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 15, 15, 20];

// ============================================================
// Fechas en hora de Chile
// ============================================================
function hoyChile() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}
function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/**
 * Instante UTC en el que el reloj de pared chileno marca `hora:minuto` de `fecha`.
 *
 * Se le pregunta el offset al motor de zonas en vez de asumir UTC-4, porque
 * Chile cambia de hora. Ojo con el signo: `enChile` es qué hora marca Chile
 * cuando en UTC son las `hora`, así que hay que RESTAR ese desfase, no sumarlo.
 */
function instanteChile(fecha, hora, minuto) {
  const hh = String(hora).padStart(2, "0");
  const mm = String(minuto).padStart(2, "0");
  const tentativo = new Date(`${fecha}T${hh}:${mm}:00Z`);
  // sv-SE da "YYYY-MM-DD HH:mm:ss"; con la T y la Z se parsea como UTC.
  const enChile = new Date(
    tentativo.toLocaleString("sv-SE", { timeZone: "America/Santiago" }).replace(" ", "T") + "Z"
  );
  const desfase = enChile.getTime() - tentativo.getTime();
  return new Date(tentativo.getTime() - desfase);
}

// ============================================================
// Borrado
// ============================================================
async function borrarDemo() {
  const { data: pedidos, error } = await soloDemo(admin.from("pedidos").select("id"));
  if (error) throw new Error(`No se pudieron listar los pedidos demo: ${error.message}`);

  const ids = (pedidos ?? []).map((p) => p.id);
  console.log(`Pedidos demo encontrados: ${ids.length}`);
  if (ids.length === 0) return;

  // En lotes: un `IN` con miles de uuid revienta el largo de la URL.
  for (let i = 0; i < ids.length; i += LOTE) {
    const trozo = ids.slice(i, i + LOTE);
    await admin.from("pedido_items").delete().in("pedido_id", trozo);
    await admin.from("pedido_eventos").delete().in("pedido_id", trozo);
    const { error: errPed } = await admin.from("pedidos").delete().in("id", trozo);
    if (errPed) throw new Error(`Fallo borrando pedidos: ${errPed.message}`);
    process.stdout.write(`\r  borrados ${Math.min(i + LOTE, ids.length)}/${ids.length}`);
  }
  console.log("");

  const { data: quedan } = await soloDemo(admin.from("pedidos").select("id"));
  if (quedan && quedan.length > 0) {
    console.error(`⚠️  Quedaron ${quedan.length} pedidos demo sin borrar.`);
    process.exit(1);
  }
  console.log("✅ Datos demo eliminados.");
}

// ============================================================
// Siembra
// ============================================================
async function sembrarDemo() {
  const { data: local, error: errLocal } = await admin
    .from("locales")
    .select("id, nombre, mesas")
    .eq("slug", SLUG)
    .single();
  if (errLocal || !local) throw new Error(`No existe el local "${SLUG}"`);

  const { data: productos, error: errProd } = await admin
    .from("productos")
    .select("id, nombre, precio")
    .eq("local_id", local.id)
    .eq("disponible", true);
  if (errProd || !productos?.length) throw new Error("El local no tiene productos disponibles");

  // Los productos baratos se venden más: una bebida sale mucho más que un lomito.
  // Se arma una bolsa donde cada producto aparece tantas veces como su peso.
  const precioMax = Math.max(...productos.map((p) => p.precio));
  const bolsa = [];
  for (const p of productos) {
    const peso = 1 + Math.round(5 * (1 - p.precio / precioMax));
    for (let i = 0; i < peso; i++) bolsa.push(p);
  }

  const mesas = local.mesas?.length ? local.mesas : ["Mesa 1", "Mesa 2", "Barra"];
  const hasta = sumarDias(hoyChile(), -1); // hasta ayer: hoy se deja libre para pruebas en vivo
  const desde = sumarDias(hasta, -(dias - 1));

  console.log(`Local: ${local.nombre} · ${productos.length} productos`);
  console.log(`Rango: ${desde} → ${hasta} (${dias} días)`);

  // ---- Generar en memoria ----
  const pedidos = [];
  let n = 0;
  for (let d = 0; d < dias; d++) {
    const fecha = sumarDias(desde, d);
    const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    const base = entre(12, 26);
    const cuantos = Math.max(4, Math.round(base * FACTOR_DIA[diaSemana]));
    const esReciente = d >= dias - 2; // solo los últimos 2 días pueden tener pedidos en curso

    for (let i = 0; i < cuantos; i++) {
      // Dos peaks: almuerzo (el grueso) y cena.
      const almuerzo = rnd() < 0.62;
      const hora = almuerzo ? entre(12, 14) : entre(19, 21);
      const minuto = entre(0, 59);
      const creado = instanteChile(fecha, hora, minuto);

      // Ítems del pedido
      const cuantosItems = entre(1, 4);
      const usados = new Set();
      const items = [];
      for (let k = 0; k < cuantosItems; k++) {
        const prod = elegir(bolsa);
        if (usados.has(prod.id)) continue;
        usados.add(prod.id);
        items.push({ producto_id: prod.id, cantidad: entre(1, 3), precio_unitario: prod.precio });
      }
      if (items.length === 0) continue;

      const total = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
      const propina_pct = elegir(PROPINAS);
      const propina = Math.round((total * propina_pct) / 100);

      // Estados: la enorme mayoría entregados. Un pedido de hace tres meses no
      // puede seguir "en preparación", así que los intermedios solo aparecen en
      // los últimos días.
      const dado = rnd();
      let estado = "entregado";
      if (dado < 0.05) estado = "cancelado";
      else if (esReciente && dado < 0.18) estado = elegir(["nuevo", "aceptado", "preparando", "listo"]);

      n++;
      pedidos.push({
        fecha,
        creado,
        fila: {
          local_id: local.id,
          numero_pedido: 0, // se asigna más abajo, correlativo por día
          estado,
          nombre_cliente: elegir(NOMBRES),
          mesa: elegir(mesas),
          total,
          notas: rnd() < 0.12 ? elegir(["Sin mayo", "Para llevar", "Poca sal", "Bien cocido"]) : null,
          created_at: creado.toISOString(),
          updated_at: creado.toISOString(),
          client_request_id: `${PREFIJO}-${String(n).padStart(4, "0")}-4000-8000-${String(n).padStart(12, "0")}`,
          propina,
          propina_pct,
          // Los pedidos demo NO llevan telefono, a propósito: son datos de
          // exhibicion y 7.900 numeros que parecen reales serian un problema
          // esperando. `telefono` queda NULL y `tipo_entrega` cae en su default.
          // Si alguna vez hace falta mostrar un retiro en la demo, poner
          // `tipo_entrega: "retiro"` SIN telefono.
        },
        items,
      });
    }
  }

  // Correlativo por día, empezando en 1 cada jornada (así funciona `crear_pedido`).
  const porDia = new Map();
  pedidos.sort((a, b) => a.creado - b.creado);
  for (const p of pedidos) {
    const c = (porDia.get(p.fecha) ?? 0) + 1;
    porDia.set(p.fecha, c);
    p.fila.numero_pedido = c;
  }

  console.log(`Pedidos a generar: ${pedidos.length}`);
  if (!sembrar) {
    console.log("\n(dry-run) Nada fue escrito. Volvé a correr con --sembrar para ejecutar.");
    return;
  }

  // ---- Escribir en lotes ----
  let escritos = 0;
  for (let i = 0; i < pedidos.length; i += LOTE) {
    const trozo = pedidos.slice(i, i + LOTE);

    const { data: insertados, error } = await admin
      .from("pedidos")
      .insert(trozo.map((p) => p.fila))
      .select("id, client_request_id, created_at, estado");
    if (error) throw new Error(`Fallo insertando pedidos: ${error.message}`);

    const porRequestId = new Map(insertados.map((p) => [p.client_request_id, p]));

    // Ítems
    const filasItems = [];
    for (const p of trozo) {
      const ins = porRequestId.get(p.fila.client_request_id);
      for (const it of p.items) filasItems.push({ pedido_id: ins.id, ...it, notas: null });
    }
    const { error: errItems } = await admin.from("pedido_items").insert(filasItems);
    if (errItems) throw new Error(`Fallo insertando ítems: ${errItems.message}`);

    // Auditoría. El trigger ya creó un evento por cada INSERT, pero con la fecha
    // de HOY: si se dejara, el reporte de tiempos de cocina daría cualquier cosa.
    // Se borran esos y se escribe la línea de tiempo real del pedido.
    const ids = insertados.map((p) => p.id);
    await admin.from("pedido_eventos").delete().in("pedido_id", ids);

    const eventos = [];
    for (const p of trozo) {
      const ins = porRequestId.get(p.fila.client_request_id);
      const t0 = p.creado.getTime();
      eventos.push({
        pedido_id: ins.id, local_id: local.id, estado_anterior: null,
        estado_nuevo: "nuevo", actor: null, created_at: new Date(t0).toISOString(),
      });

      if (p.fila.estado === "cancelado") {
        eventos.push({
          pedido_id: ins.id, local_id: local.id, estado_anterior: "nuevo",
          estado_nuevo: "cancelado", actor: null,
          created_at: new Date(t0 + entre(30, 180) * 1000).toISOString(),
        });
        continue;
      }

      // Secuencia real de cocina, con tiempos verosímiles.
      const camino = ["aceptado", "preparando", "listo", "entregado"];
      const hasta_ = camino.indexOf(p.fila.estado);
      if (hasta_ < 0) continue; // quedó en "nuevo"
      let t = t0;
      let anterior = "nuevo";
      const saltos = [entre(30, 180), entre(60, 240), entre(300, 900), entre(60, 300)];
      for (let k = 0; k <= hasta_; k++) {
        t += saltos[k] * 1000;
        eventos.push({
          pedido_id: ins.id, local_id: local.id, estado_anterior: anterior,
          estado_nuevo: camino[k], actor: null, created_at: new Date(t).toISOString(),
        });
        anterior = camino[k];
      }
    }

    for (let j = 0; j < eventos.length; j += 1000) {
      const { error: errEv } = await admin.from("pedido_eventos").insert(eventos.slice(j, j + 1000));
      if (errEv) throw new Error(`Fallo insertando eventos: ${errEv.message}`);
    }

    escritos += trozo.length;
    process.stdout.write(`\r  ${escritos}/${pedidos.length} pedidos`);
  }
  console.log("");

  // ---- Verificación ----
  const { count } = await soloDemo(
    admin.from("pedidos").select("*", { count: "exact", head: true })
  );
  console.log(`\n✅ Sembrados. Pedidos demo en la base: ${count}`);
  console.log(`   Para revertir: node scripts/sembrar-demo.mjs --borrar`);
}

async function main() {
  if (borrar) return borrarDemo();
  return sembrarDemo();
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
