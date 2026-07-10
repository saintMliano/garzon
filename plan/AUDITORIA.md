# Auditoría de consolidación — 2026-07-10

Revisión de consolidación (Fases 0-4) hecha por el arquitecto (Claude Fable 5) según el protocolo
de `CLAUDE.md`: se leyó `developer-context.md` completo, las 10 migraciones de `migrations/` en
orden, `supabase-schema.sql` y todos los archivos de `src/` relevantes (RPCs, RLS, proxy, endpoint
de onboarding, dashboard, flujo del cliente, clientes Supabase, tipos).

## Veredicto general

**La arquitectura declarada coincide con el código real.** Se verificó punto por punto:

- ✅ RLS: `pedidos`/`pedido_items` sin acceso público; lectura/actualización solo por staff del
  local (`fase0-auth-rls.sql`). Escritura de menú/branding por staff (`fase4-1-menu-rls.sql`).
- ✅ RPCs `crear_pedido` (total en servidor, valida local activo y disponibilidad, numeración por
  local/día bajo advisory lock — versión vigente en `fase3-multitenant.sql`) y `get_order_status`
  (solo estado/número/fecha).
- ✅ Service-role key solo en `src/lib/supabase/admin.ts`, importado únicamente por el route
  handler `/api/admin/onboard`, que verifica sesión + `platform_admins` (401/403/400/409 correctos,
  rollback best-effort).
- ✅ Storage: bucket `menu` público en lectura; escritura scopeada por carpeta = `local_id`.
- ✅ `proxy.ts` protege `/dashboard`; seguimiento del cliente por polling 4s; theming `--brand`/`--accent`;
  trigger `updated_at`; carrito/pedido persistidos con TTL.

El producto es funcionalmente sólido para demo/piloto. **No está listo para producción** por los
hallazgos S1–S5 y la ausencia total de tests. El plan de tareas (`README.md`) los resuelve.

## Hallazgos por severidad

### Crítico (bloqueante de producción)

- **S1 — Secretos comprometidos durante el desarrollo.** La service-role key, la contraseña de la
  base y la del super-admin se expusieron en sesiones de desarrollo (reconocido en `CLAUDE.md`).
  Mientras no se roten, cualquier persona con acceso a esos historiales tiene control total de la
  base. → **T1**.

### Alto

- **S2 — `crear_pedido` sin rate-limit ni topes.** Es ejecutable por `anon` sin restricción de
  frecuencia ni de tamaño: se puede inundar una cocina con pedidos basura, y una `cantidad`
  gigante (p. ej. 1.000.000 × $5.000) desborda el `int` del total generando errores 500 ruidosos.
  El rate-limit del onboard también sigue pendiente (mitigado: exige sesión de super-admin). → **T2**.
- **S3 — Sin máquina de estados de pedidos.** El staff autenticado puede poner **cualquier**
  `estado` vía UPDATE directo (p. ej. resucitar un `cancelado` o saltar de `nuevo` a `entregado`);
  el compare-and-set vive solo en el cliente. Además la RLS permite al staff actualizar **todas**
  las columnas de `pedidos` (incluido `total`), lo que corrompería estadísticas. → **T3**.
- **S4 — Staff puede editar `slug` y `activo` de su local.** La política "Staff update locales"
  (fase 4.1) no restringe columnas: un dueño puede romper sus QRs impresos cambiando el slug,
  squatear un slug ajeno aún no registrado, o desactivarse por error. `id`/`created_at` tampoco
  están protegidos. → **T4**.

### Medio

- **M1 — Carrera de precios dentro de `crear_pedido`.** El precio se lee dos veces (cálculo del
  total y luego inserción de items). Con READ COMMITTED, un cambio de precio entre ambos loops
  produce un pedido cuyo `total` no cuadra con sus items; si el producto pasa a no disponible entre
  loops, `precio_unitario` queda NULL y la transacción aborta con un error críptico. → **T2**.
- **M2 — El seguimiento del cliente nunca ve `entregado`.** `order-status.tsx` detiene el polling
  al llegar a `listo`, por lo que la auto-limpieza documentada "al pasar a entregado" no ocurre
  jamás (el pedido persiste hasta el TTL de 3 h o hasta que el cliente pulse el botón). Doc y
  código se contradicen. → **T5**.
- **M3 — Zona horaria inconsistente en las estadísticas del dashboard.** "Pedidos/Venta de hoy" usa
  la medianoche **del navegador de la tablet**, mientras la numeración de pedidos usa
  `America/Santiago`. Una tablet mal configurada muestra estadísticas de otro día. → **T5**.
- **M4 — Bucket `menu` sin límites.** No hay `file_size_limit` ni `allowed_mime_types` a nivel de
  bucket: el staff puede subir archivos arbitrarios y enormes desde el cliente autenticado (el
  límite de 3 MB solo existe en el endpoint de onboarding). → **T4**.
- **M5 — `Database = Record<string, any>`.** Todo el acceso a datos está sin tipar; los errores de
  columna/tabla solo se descubren en runtime. Estaba planificado para la Fase 6, pero conviene
  adelantarlo: es la red de seguridad más barata para ejecutores menos capaces. → **T7**.
- **M6 — Cero tests automatizados.** Nada protege las invariantes de seguridad (aislamiento RLS,
  total en servidor) contra regresiones. → **T8**.

### Bajo

- **B1 — Link "Alta de local" visible para todo el staff.** La página se gatea bien (cliente +
  servidor), pero el link en la navegación del dashboard confunde y revela una función de
  plataforma. → **T5**.
- **B2 — `developer-context.md` desactualizado en puntos.** Dice "dos clientes Supabase" (son
  tres, falta `admin.ts` en esa sección), la "Estructura de Carpetas Clave" no incluye
  `/dashboard/{menu,config,admin}` ni `/api/admin/onboard`, y el flujo del cliente afirma la
  auto-limpieza en `entregado` (ver M2). → **T6**.
- **B3 — Rollback manual best-effort en el onboarding.** Si el borrado compensatorio falla queda
  un local/usuario huérfano. Aceptable por ahora; documentarlo como limitación conocida. → **T6**.
- **B4 — Tipos desalineados con la base.** `Producto.categoria_id` es `string` en TS pero nullable
  en la base (`ON DELETE SET NULL`). → **T7**.

## Qué NO encontré (verificado y sano)

- Ningún camino que permita a un tenant leer/editar datos de otro (RLS correcta en todas las tablas
  y en Storage; las RPCs validan `local_id` en cada producto).
- Ningún uso de la service-role key fuera del servidor.
- El total del cliente nunca se envía ni se usa: `crear_pedido` lo ignora por diseño.
- `get_order_status` expone solo campos no sensibles y el UUID del pedido actúa como bearer token
  no adivinable.
