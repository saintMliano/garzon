import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { adminClient, SUPABASE_URL, SUPABASE_ANON_KEY } from "./setup";

/**
 * Cambio de contraseña desde `/dashboard/cuenta`.
 *
 * Reproduce el flujo exacto de esa pantalla contra Supabase real. Existe por un
 * bug concreto que casi se va a producción: verificar la contraseña actual
 * requiere iniciar sesión en un cliente aparte, y el `signOut()` por defecto de
 * Supabase es **global** — revoca todas las sesiones del usuario. Sin
 * `scope: "local"`, comprobar la clave cerraba la sesión de quien la estaba
 * cambiando y la de todas las tablets de la cocina.
 */
describe("Cambio de contraseña de la cuenta", () => {
  const VIEJA = "Clave-Vieja-Para-Test-01";
  const NUEVA = "Clave-Nueva-Para-Test-02";

  let email: string;
  let userId: string;

  const clienteNuevo = () =>
    createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  beforeEach(async () => {
    email = `test-cuenta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.garzon`;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: VIEJA,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`No se pudo crear la cuenta de prueba: ${error?.message}`);
    userId = data.user.id;
  });

  afterEach(async () => {
    await adminClient.auth.admin.deleteUser(userId);
    const { data } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const huerfano = (data?.users ?? []).some((u) => u.id === userId);
    expect(huerfano, "quedó una cuenta de prueba sin borrar").toBe(false);
  });

  test("Una contraseña actual equivocada no cambia nada ni tumba la sesión", async () => {
    const pestana = clienteNuevo();
    await pestana.auth.signInWithPassword({ email, password: VIEJA });

    const verificador = clienteNuevo();
    const { error } = await verificador.auth.signInWithPassword({
      email,
      password: `no-es-la-clave-${randomUUID()}`,
    });
    expect(error).not.toBeNull();

    // La sesión de quien está en la pantalla sigue viva: por eso la
    // verificación va en un cliente desechable y no en el de la página.
    const { data } = await pestana.auth.getUser();
    expect(data.user).not.toBeNull();

    // Y la contraseña no cambió.
    const control = clienteNuevo();
    const { error: errEntrar } = await control.auth.signInWithPassword({ email, password: VIEJA });
    expect(errEntrar).toBeNull();
  });

  test("Verificar la clave actual NO puede cerrar las otras sesiones", async () => {
    // El bug que este test existe para atrapar: `signOut()` sin scope es global.
    const pestana = clienteNuevo();
    await pestana.auth.signInWithPassword({ email, password: VIEJA });

    const verificador = clienteNuevo();
    await verificador.auth.signInWithPassword({ email, password: VIEJA });
    await verificador.auth.signOut({ scope: "local" });

    const { data } = await pestana.auth.getUser();
    expect(data.user, "el signOut del verificador se llevó puesta la sesión de la página").not.toBeNull();
  });

  test("Con la clave actual correcta, el cambio se aplica y la vieja deja de servir", async () => {
    const pestana = clienteNuevo();
    await pestana.auth.signInWithPassword({ email, password: VIEJA });

    const verificador = clienteNuevo();
    await verificador.auth.signInWithPassword({ email, password: VIEJA });
    await verificador.auth.signOut({ scope: "local" });

    const { error } = await pestana.auth.updateUser({ password: NUEVA });
    expect(error).toBeNull();

    const conNueva = clienteNuevo();
    expect((await conNueva.auth.signInWithPassword({ email, password: NUEVA })).error).toBeNull();

    const conVieja = clienteNuevo();
    expect((await conVieja.auth.signInWithPassword({ email, password: VIEJA })).error).not.toBeNull();
  });

  test("Supabase SÍ cierra las demás sesiones al cambiar la clave", async () => {
    // No es lo que elegimos: es lo que hace Supabase, y es correcto en
    // seguridad. Se documenta acá porque la pantalla se lo advierte al dueño
    // ANTES de cambiarla — una tablet que se desloguea sola a mitad de servicio,
    // sin explicación, se lee como que el sistema se cayó.
    const pestana = clienteNuevo();
    await pestana.auth.signInWithPassword({ email, password: VIEJA });

    const tabletCocina = clienteNuevo();
    await tabletCocina.auth.signInWithPassword({ email, password: VIEJA });
    expect((await tabletCocina.auth.getUser()).data.user).not.toBeNull();

    await pestana.auth.updateUser({ password: NUEVA });

    const { data } = await tabletCocina.auth.getUser();
    expect(data.user, "si esto cambia, hay que actualizar el aviso de la pantalla").toBeNull();
  });
});
