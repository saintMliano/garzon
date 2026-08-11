# Fase 5 — Turno autónomo

Plan ejecutable de la Fase 5, producido por la auditoría del **2026-08-10** (ver
[Hallazgos](#hallazgos-que-origina-cada-tarea) al final). Reemplaza a la antigua Fase 5
("dominios propios"), que se movió al final del roadmap por decisión del dueño del producto.

## Objetivo

**Que un local opere un turno completo, solo, sin el fundador presente.**

Ese es el criterio de aceptación de toda la fase. No es una lista de features: es la diferencia
entre un piloto que se convierte a pago y uno que se cae el primer mediodía. Los hallazgos que
resuelve no aparecen con 8 pedidos de prueba — aparecen todos el primer día real.

## Roadmap re-priorizado (aprobado 2026-08-10)

| Fase | Contenido | Estado |
|---|---|---|
| **F5 — Turno autónomo** | Esta página | En curso |
| F6 — Cierre de caja | `/dashboard/reportes`: pedidos, venta, ticket promedio, top productos | Pendiente |
| F7 — Rendimiento percibido | Menú a Server Component, `generateMetadata`, refresco de menú y precios | Pendiente |
| F8 — Confianza | Idempotencia de `crear_pedido`, auditoría de cambios de estado | Pendiente |
| F9 — Marca completa | Terminar white-label, validar contraste, pulido | Pendiente |
| F10 — Negocio | Propina, planes/suscripción, pago en línea | Pendiente |
| F11 — Dominios propios | Cuando un cliente lo pida **y lo pague** | Pendiente |

## Tareas

| # | Tarea | Tipo | Estado |
|---|-------|------|--------|
| F5.1 | Limpiar datos de prueba huérfanos + arreglar `cleanupTestFixtures` | Datos + Tests | [x] |
| F5.2 | Cuenta de acceso para Catire Kaffe (demo) | Datos | [x] |
| F5.3 | Selector de local basado en `local_staff` | TypeScript | [x] |
| F5.4 | Carga inicial del Kanban independiente de realtime + estado de conexión | TypeScript | [x] |
| F5.5 | Deshacer entrega + panel "Cerrados hoy" | SQL + TypeScript | [x] |
| F5.6 | Aviso persistente de sonido apagado | TypeScript | [x] |
| F5.7 | Rate-limit de pedidos configurable por local | SQL + Tests | [x] |
| F5.8 | Verificación end-to-end y bitácora | Verificación | [x] |

### F5.1 — Limpiar datos de prueba y arreglar la causa raíz

`cleanupTestFixtures` envolvía toda la limpieza en un `try/catch` que solo hacía `console.error`.
Cuando fallaba, los tests seguían pasando en verde y los locales de prueba quedaban vivos en la
base real. Se acumularon **10 locales huérfanos** con 15 productos, todos `activo = true` y
públicamente enumerables.

- Borrados con `scripts/limpiar-datos-test.mjs` (dry-run por defecto, `--borrar` para ejecutar).
  Filtra por prefijo `test-local-` y dominio `@test.garzon`: no puede tocar un local real.
- `tests/setup.ts` ahora acumula los fallos, **verifica** que no quedaron locales y **lanza
  excepción** si algo sobrevive. Un test que ensucia la base ya no puede pasar en verde.

### F5.2 — Cuenta de acceso para Catire Kaffe

El local se sembró por script y quedó sin dueño: las únicas filas de `local_staff` eran del
super-admin, así que el cliente no podía abrir su propio dashboard.

- `scripts/crear-cuenta-local.mjs <slug> <email> [password]` crea la cuenta, la vincula en
  `local_staff` y **verifica con un login real** que la RLS le muestra el local.
- Es idempotente: si el usuario ya existe, solo asegura el vínculo.
- Mientras el local sea una demo sin presentar, la credencial es genérica y **debe rotarse**
  antes de entregárselo al cliente real (usar `/dashboard/admin` para el alta definitiva).

### F5.3 — Selector de local basado en `local_staff`

Las tres páginas del dashboard listaban **todos** los locales cuando el usuario era
`platform_admin`. Pero ser super-admin no da acceso a los datos: la RLS exige fila en
`local_staff`. Al seleccionar un local sin vínculo, las consultas devolvían vacío **sin error**,
indistinguible de "no hay pedidos".

- La lista sale siempre de `local_staff`; `platform_admins` queda solo para mostrar el link
  "Alta de local".
- **Decisión de arquitectura:** no se amplió la RLS para que `platform_admins` lea cualquier
  local. Eso debilitaría la única regla de aislamiento del sistema por comodidad de una pantalla.
  Si el super-admin necesita dar soporte a un local, se agrega como staff explícitamente.

### F5.4 — Carga inicial independiente de realtime

El primer `fetchPedidos()` colgaba del callback `SUBSCRIBED` del canal. Si el wifi del local
bloquea WebSockets (portal cautivo, red corporativa), la cocina veía "Cargando dashboard…"
**hasta 30 segundos**, hasta que entraba el polling de respaldo.

- El fetch inicial ahora dispara al montar, sin esperar al canal.
- Se agrega un indicador de conexión en el header (`En vivo` / `Conectando` / `Sin conexión`),
  para que la cocina pueda distinguir "no hay pedidos" de "no me están llegando".

### F5.5 — Deshacer entrega y panel "Cerrados hoy"

`entregado` era terminal y "Entregar" no pedía confirmación, a 8 px del botón "Rechazar" que sí
la pedía. Un toque accidental borraba el pedido de la pantalla para siempre.

- Migración `f5-1-reapertura-pedidos.sql`: agrega **una sola** transición de vuelta,
  `entregado → listo`. No se permite resucitar cancelados: el cliente ya vio esa pantalla.
- Toast "Pedido #012 entregado — Deshacer" con ventana de 12 s (en pleno servicio nadie reacciona
  en 3).
- Panel "Cerrados hoy" con los entregados y rechazados del día y botón "Reabrir": la red de
  seguridad cuando el toast ya se fue.

### F5.6 — Aviso persistente de sonido apagado

`soundEnabled` vivía en estado de React: cualquier recarga de la tablet devolvía la cocina al
silencio y solo reaparecía un botón discreto en el header que nadie miraba.

- Barra roja a ancho completo bajo el header mientras el audio no esté activo.
- Se vigila el `AudioContext` cada 5 s: el navegador puede suspenderlo por su cuenta, y el aviso
  debe reflejar el estado real y no lo que creíamos al activarlo.

### F5.7 — Rate-limit configurable por local

El tope fijo de 15 pedidos/min es 1 cada 4 segundos: una apertura de mediodía con 10 mesas
confirmando a la vez ya consume dos tercios del techo, y el cliente legítimo veía "Demasiados
pedidos" delante del dueño.

- Migración `f5-2-rate-limit-configurable.sql`: columna `locales.limite_pedidos_min`
  (default **40**, `CHECK` entre 1 y 500) leída por `crear_pedido`.
- **No** se agregó a los privilegios de UPDATE del staff (T4): es una perilla de plataforma, no
  de branding, y queda al service-role.
- **Limitación conocida:** esto protege de ráfagas accidentales, no de un atacante decidido, que
  igual satura y de paso deja fuera a los clientes buenos. La defensa real es un desafío/token de
  sesión en el checkout → queda anotado para **F8**.

### F5.8 — Verificación

- ✅ `npx tsc --noEmit` y `npm run build` limpios; 0 errores de lint en los archivos tocados.
- ✅ `npm test`: **22/22** (19 previos − 1 reemplazado + 4 nuevos).
- ✅ Migraciones aplicadas y verificadas contra la base (`limite_pedidos_min = 40` en los 2 locales).
- ✅ `scripts/limpiar-datos-test.mjs` confirma 0 huérfanos tras la corrida de tests.
- ✅ Entrada fechada en `developer-context.md`.
- ⏳ **Pendiente: la prueba con un pedido real.** Los tests cubren las invariantes de la base, no la
  sensación de usar la tablet en una cocina. Falta ejercitar en `catirekaffe`: pedir desde el
  celular → Kanban → entregar → deshacer → reabrir desde el panel.

## Migraciones

**Desde el 2026-08-11 hay pipeline.** Las de esta fase ya están aplicadas:

- `supabase/migrations/20260811172042_f5_1_reapertura_pedidos.sql`
- `supabase/migrations/20260811172047_f5_2_rate_limit_configurable.sql`

Flujo para las siguientes: `npm run db:backup` → `npm run db:push --dry-run` para revisar el plan →
`npm run db:push`. Las copias en `migrations/f5-*.sql` quedan por coherencia con el historial de esa
carpeta; **la fuente de verdad es `supabase/migrations/`**.

## Hallazgos que origina cada tarea

De la auditoría del 2026-08-10 (verificada contra la base real, no solo contra el código):

| ID | Hallazgo | Tarea |
|---|---|---|
| B1 | Catire Kaffe sin cuenta de dueño | F5.2 |
| B2 | 10 locales de prueba huérfanos y públicos | F5.1 |
| B3 | Selector de local muestra locales sin acceso RLS | F5.3 |
| B4 | Kanban no carga si el WebSocket no conecta | F5.4 |
| B5 | Sin deshacer ni historial en cocina | F5.5 |
| A1 | Rate-limit castiga el peak legítimo | F5.7 |
| A4 | El sonido se apaga en silencio | F5.6 |
| M4 | Kanban de 4 columnas no cabe en tablet de 10-11" | F5.4 (incluido) |

Hallazgos diferidos a fases posteriores: **A2** (idempotencia → F8), **A3** (precios obsoletos en
el carrito → F7), **A5** (cierre de caja → F6), **M1** (enumeración de `locales` → F7, se cierra
sola al migrar a Server Component), **M2/M3** (white-label incompleto y contraste → F9).
