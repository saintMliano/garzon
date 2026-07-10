# T1 — Rotación de secretos (P0, bloqueante de producción)

**Tipo:** manual (requiere acceso al dashboard de Supabase; un modelo solo puede asistir/verificar).
**Hallazgo que resuelve:** S1 de [`AUDITORIA.md`](../AUDITORIA.md).

## Contexto

Durante el desarrollo se expusieron: la **service-role key** de Supabase, la **contraseña de la
base de datos** y la **contraseña del super-admin**. Cualquiera de las tres da control total o
casi total. Deben rotarse antes de operar con clientes reales.

## Pasos

1. **Service-role key** — Supabase Dashboard → Settings → API:
   - Regenerar la service-role key (botón "Reset"/"Generate new secret").
   - Actualizar `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (y en el hosting cuando exista deploy).
   - Verificar que la anon key **no** haya cambiado; si también se rota, actualizar
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. **Contraseña de la base** — Supabase Dashboard → Settings → Database → "Reset database password".
   La app no la usa directamente (todo va por la API de Supabase), así que no hay que tocar código;
   solo guardar la nueva en el gestor de contraseñas del dueño.
3. **Contraseña del super-admin** — con sesión del super-admin en la app no hay UI de cambio de
   contraseña; hacerlo desde Supabase Dashboard → Authentication → Users → (usuario super-admin) →
   "Reset password", o vía SQL Editor no (no se puede); usar el dashboard.
4. **Revisar historial:** confirmar con `git log -p -- .env.local .env* 2>/dev/null` y
   `git log --all --oneline | head` que ningún secreto quedó commiteado en el repo. (A la fecha de
   la auditoría no hay ninguno versionado; esto es una re-verificación.)

## Verificación

- Con la key vieja (si se conserva en un scratch temporal), una llamada REST a la API de Supabase
  debe devolver 401.
- Flujo real: iniciar `npm run dev`, entrar a `/dashboard/admin` con el super-admin (contraseña
  nueva) y dar de alta un local de prueba → debe funcionar (usa la service-role nueva). **Eliminar
  el local, el usuario y los objetos de Storage de prueba al terminar.**
- Login de cocina del local demo sigue funcionando.

## Qué NO hacer

- No commitear ningún valor de secreto en ningún archivo (ni en esta tarea al marcarla como hecha).
- No tocar código de la app: esta tarea es solo de credenciales.

## Al terminar

Marcar T1 en `plan/README.md` y agregar entrada fechada en `developer-context.md` (sin valores,
solo "secretos rotados").
