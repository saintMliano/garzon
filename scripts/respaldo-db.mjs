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
import { mkdirSync, existsSync, writeFileSync, statSync } from "fs";
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
const TABLAS = [
  "locales",
  "categorias",
  "productos",
  "pedidos",
  "pedido_items",
  "local_staff",
  "platform_admins",
];

const DIR = "backups";
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

// Sin dos puntos: Windows no los admite en nombres de archivo.
const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const destino = `${DIR}/${sello}-datos.json`;

async function main() {
  const respaldo = { generado: new Date().toISOString(), proyecto: url, tablas: {} };
  const resumen = [];

  for (const tabla of TABLAS) {
    const { data, error } = await admin.from(tabla).select("*");
    if (error) {
      console.error(`✗ No se pudo leer "${tabla}": ${error.message}`);
      console.error("  Respaldo incompleto. NO sigas con migraciones.");
      process.exit(1);
    }
    respaldo.tablas[tabla] = data ?? [];
    resumen.push(`${tabla}: ${data?.length ?? 0}`);
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

  // Un archivo vacío es un respaldo falso: peor que no tenerlo, porque da
  // confianza sin cubrir nada.
  const bytes = statSync(destino).size;
  if (bytes < 200) {
    console.error(`✗ ${destino} quedó prácticamente vacío (${bytes} bytes). NO sigas.`);
    process.exit(1);
  }

  console.log(`✓ ${destino} (${(bytes / 1024).toFixed(1)} KB)`);
  console.log(`  ${resumen.join(" · ")}`);
  console.log("\n⚠️  No incluye contraseñas, archivos de Storage ni el esquema.");
  console.log("✅ Respaldo listo. Ahora sí podés correr `npm run db:push`.");
}

main().catch((err) => {
  console.error("Error fatal:", err.message);
  process.exit(1);
});
