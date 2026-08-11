/**
 * Ejecuta un comando con las variables de .env.local cargadas.
 *
 * Existe para que el CLI de Supabase reciba `SUPABASE_ACCESS_TOKEN` y la
 * contraseña de Postgres **por entorno** y no como argumento: un
 * `--password <clave>` queda en el historial del shell y en la lista de
 * procesos de la máquina.
 *
 * Uso:
 *   node scripts/con-env.mjs npx supabase db push
 */
import { spawnSync } from "child_process";
import dotenv from "dotenv";

// quiet: el banner de dotenv iría a stdout y se colaría dentro de los
// archivos generados por redirección (p. ej. `db:types > supabase.ts`).
dotenv.config({ path: ".env.local", quiet: true });

// El CLI de Supabase espera SUPABASE_DB_PASSWORD; en .env.local la variable se
// llama DATABASE_PASSWORD. Se mapea acá para no duplicar el secreto.
if (!process.env.SUPABASE_DB_PASSWORD && process.env.DATABASE_PASSWORD) {
  process.env.SUPABASE_DB_PASSWORD = process.env.DATABASE_PASSWORD;
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("Uso: node scripts/con-env.mjs <comando> [args...]");
  process.exit(1);
}

const res = spawnSync(cmd, args, { stdio: "inherit", shell: true, env: process.env });
process.exit(res.status ?? 1);
