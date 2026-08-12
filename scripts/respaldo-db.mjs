/**
 * Respaldo de los DATOS de la base antes de tocar el esquema.
 *
 * En el plan gratis de Supabase NO hay Point-in-Time Recovery: si una migración
 * borra o corrompe algo, no hay botón de deshacer. Este script es el reemplazo
 * casero — se corre SIEMPRE antes de un `db push`.
 *
 * POR QUÉ SOLO DATOS (y por qué alcanza):
 *   `supabase db dump` haría un respaldo completo (esquema + datos) pero exige
 *   Docker Desktop, que no está instalado. No importa demasiado: el **esquema
 *   vive en git** (migrations/ + supabase-schema.sql), así que es reconstruible.
 *   Los datos de los clientes no están en ningún lado. Eso es lo irreemplazable
 *   y es lo que esto respalda.
 *
 * LO QUE ESTO **NO** CUBRE — leelo antes de confiar:
 *   - Las contraseñas de las cuentas (Supabase no las expone; son irrecuperables).
 *   - Las fotos subidas a Storage (los archivos; sí quedan las URLs).
 *   - El esquema en sí: funciones, políticas RLS, triggers, privilegios.
 *   Para un respaldo completo hace falta Docker + `supabase db dump`, o el plan
 *   Pro con respaldos automáticos.
 *
 * Uso:
 *   npm run db:backup
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from "fs";
import dotenv from "dotenv";

// quiet: el banner de dotenv iría a stdout y se colaría dentro de los
// archivos generados por redirección (p. ej. `db:types > supabase.ts`).
dotenv.config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Orden de dependencias, para que un restore se pueda hacer de arriba hacia abajo.
// La clave es solo para paginar con un orden estable; `local_staff` y
// `platform_admins` no tienen `id`, su llave es compuesta.
const TABLAS = [
  { nombre: "locales", clave: ["id"] },
  { nombre: "categorias", clave: ["id"] },
  { nombre: "productos", clave: ["id"] },
  { nombre: "pedidos", clave: ["id"] },
  { nombre: "pedido_items", clave: ["id"] },
  { nombre: "local_staff", clave: ["local_id", "user_id"] },
  { nombre: "platform_admins", clave: ["user_id"] },
];

const DIR = "backups";
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

// PostgREST devuelve como máximo 1000 filas por consulta y **no avisa** que
// truncó. Con la base demo sembrada (7.920 pedidos) el respaldo venía cortado
// en 1000 desde el primer día, con cara de estar completo. Se pagina por rango
// y al final se contrasta contra el conteo real de la tabla.
const PAGINA = 1000;

async function leerTabla({ nombre, clave }) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    // Orden estable: sin `order` el motor puede devolver la misma fila en dos
    // páginas y omitir otra.
    let q = admin.from(nombre).select("*");
    for (const col of clave) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(desde, desde + PAGINA - 1);
    if (error) return { error };
    filas.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGINA) break;
  }

  // El conteo se pide aparte: es la única forma de saber que no faltó nada.
  const { count, error: errCount } = await admin
    .from(nombre)
    .select("*", { count: "exact", head: true });
  if (errCount) return { error: errCount };
  if (count !== filas.length) {
    return { error: { message: `se leyeron ${filas.length} filas de ${count}` } };
  }

  return { filas };
}

// Sin dos puntos: Windows no los admite en nombres de archivo.
const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const destino = `${DIR}/${sello}-datos.json`;

async function main() {
  const respaldo = { generado: new Date().toISOString(), proyecto: url, tablas: {} };
  const resumen = [];

  for (const tabla of TABLAS) {
    const { filas, error } = await leerTabla(tabla);
    if (error) {
      console.error(`✗ No se pudo leer "${tabla.nombre}": ${error.message}`);
      console.error("  Respaldo incompleto. NO sigas con migraciones.");
      process.exit(1);
    }
    respaldo.tablas[tabla.nombre] = filas;
    resumen.push(`${tabla.nombre}: ${filas.length}`);
  }

  // Cuentas: solo id y email. Las contraseñas no se pueden exportar, así que
  // restaurar una cuenta implica recrearla y que el dueño fije clave nueva.
  const { data: users, error: errUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (errUsers) {
    console.error(`✗ No se pudieron listar las cuentas: ${errUsers.message}`);
    process.exit(1);
  }
  respaldo.cuentas = (users?.users ?? []).map((u) => ({ id: u.id, email: u.email }));
  resumen.push(`cuentas: ${respaldo.cuentas.length}`);

  writeFileSync(destino, JSON.stringify(respaldo, null, 2), "utf-8");

  // Un respaldo incompleto es peor que no tenerlo: da confianza sin cubrir
  // nada. El umbral de bytes no alcanza — un archivo de 0,5 KB con una sola
  // tabla lo pasaba. Se relee lo escrito y se compara tabla por tabla.
  const escrito = JSON.parse(readFileSync(destino, "utf-8"));
  for (const { nombre } of TABLAS) {
    const enDisco = escrito.tablas?.[nombre]?.length;
    if (enDisco !== respaldo.tablas[nombre].length) {
      console.error(
        `✗ ${destino} no contiene "${nombre}" completa ` +
          `(${enDisco ?? "ausente"} de ${respaldo.tablas[nombre].length}). NO sigas.`
      );
      process.exit(1);
    }
  }
  const bytes = statSync(destino).size;

  console.log(`✓ ${destino} (${(bytes / 1024).toFixed(1)} KB)`);
  console.log(`  ${resumen.join(" · ")}`);
  console.log("\n⚠️  No incluye contraseñas, archivos de Storage ni el esquema.");
  console.log("✅ Respaldo listo. Ahora sí podés correr `npm run db:push`.");
}

main().catch((err) => {
  console.error("Error fatal:", err.message);
  process.exit(1);
});
