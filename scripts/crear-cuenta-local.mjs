/**
 * Crea (o repara) la cuenta de acceso de un local que YA existe en `locales`.
 *
 * Sirve para los locales que se sembraron por script y quedaron sin dueño, y
 * para dar una cuenta demo antes de que el local sea un cliente real.
 * Para dar de alta un local NUEVO usá /dashboard/admin (endpoint onboard).
 *
 * Uso:
 *   node scripts/crear-cuenta-local.mjs <slug> <email> [password] [--reset-password]
 *
 * Si se omite la password, se genera una aleatoria y se imprime una sola vez.
 * Si el email ya existe, no lo recrea: solo asegura el vínculo en local_staff.
 * Cambiarle la contraseña a una cuenta existente exige `--reset-password`, para
 * no dejar afuera al dueño de un local real por un comando repetido.
 *
 * Las credenciales NUNCA se guardan en el repo, pero SÍ se imprimen por stdout
 * y quedan en el historial del shell: usalo en una terminal de confianza.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
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

const args = process.argv.slice(2);
const resetear = args.includes("--reset-password");
const [slug, email, passwordArg] = args.filter((a) => !a.startsWith("--"));
if (!slug || !email) {
  console.error(
    "Uso: node scripts/crear-cuenta-local.mjs <slug> <email> [password] [--reset-password]"
  );
  process.exit(1);
}

const PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function generarPassword(len = 14) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += PW_CHARS[bytes[i] % PW_CHARS.length];
  return out;
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // 1. El local debe existir.
  const { data: local, error: errLocal } = await admin
    .from("locales")
    .select("id, nombre, slug, activo")
    .eq("slug", slug)
    .maybeSingle();
  if (errLocal) throw new Error(`Error buscando el local: ${errLocal.message}`);
  if (!local) throw new Error(`No existe ningún local con slug "${slug}".`);

  console.log(`Local: ${local.nombre} (${local.slug})${local.activo ? "" : " — INACTIVO"}`);

  // 2. ¿El usuario ya existe? Se pagina: listUsers devuelve como máximo una
  //    página, y con una sola quedaríamos ciegos en un proyecto grande — y
  //    "no lo encontré" acá significa "creo una cuenta duplicada".
  let existente = null;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Error listando usuarios: ${error.message}`);
    const usuarios = data?.users ?? [];
    existente = usuarios.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (existente || usuarios.length < 200) break;
  }

  let userId;
  let password = null;

  if (existente) {
    userId = existente.id;
    console.log(`Usuario ${email} ya existía; no se recrea.`);
    if (passwordArg && !resetear) {
      console.error(
        `\n⚠️  ${email} ya existe y podría ser una cuenta real en uso.\n` +
          "    Cambiarle la contraseña dejaría al dueño afuera sin aviso.\n" +
          "    Si es lo que querés, repetí el comando con --reset-password.\n" +
          "    Sin ese flag solo se asegura el vínculo en local_staff."
      );
    } else if (passwordArg && resetear) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password: passwordArg });
      if (error) throw new Error(`No se pudo actualizar la contraseña: ${error.message}`);
      password = passwordArg;
      console.log("Contraseña actualizada (--reset-password).");
    }
  } else {
    password = passwordArg || generarPassword();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !created?.user) {
      throw new Error(`No se pudo crear la cuenta: ${error?.message}`);
    }
    userId = created.user.id;
    console.log(`Usuario ${email} creado.`);
  }

  // 3. Vincular en local_staff (idempotente: la PK es (user_id, local_id)).
  const { data: yaVinculado } = await admin
    .from("local_staff")
    .select("user_id")
    .eq("user_id", userId)
    .eq("local_id", local.id)
    .maybeSingle();

  if (yaVinculado) {
    console.log("El vínculo en local_staff ya existía.");
  } else {
    const { error } = await admin
      .from("local_staff")
      .insert({ user_id: userId, local_id: local.id });
    if (error) throw new Error(`No se pudo vincular en local_staff: ${error.message}`);
    console.log("Vínculo en local_staff creado.");
  }

  // 4. Verificación real: iniciar sesión y comprobar que la RLS deja ver el local.
  if (password) {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) {
      const cliente = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: errLogin } = await cliente.auth.signInWithPassword({ email, password });
      if (errLogin) {
        console.error(`⚠️  El login de verificación falló: ${errLogin.message}`);
        process.exit(1);
      }
      const { data: visto } = await cliente
        .from("local_staff")
        .select("local_id, locales(nombre)")
        .eq("user_id", userId);
      console.log(
        `Verificación: login OK y ve ${visto?.length ?? 0} local(es) — ` +
          (visto ?? []).map((v) => v.locales?.nombre).join(", ")
      );
      await cliente.auth.signOut();
    }
  }

  console.log("\n=== Credenciales (no se guardan en el repo) ===");
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password ?? "(sin cambios — la que ya tenía)"}`);
  console.log(`Menú:     /local/${local.slug}`);
  console.log("Dashboard: /dashboard");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
