# Auditoría — 2026-08-10

Segunda auditoría del proyecto, hecha según el protocolo de `CLAUDE.md`. A diferencia de la
[auditoría del 2026-07-10](AUDITORIA.md), que comparó el documento contra el código, esta además
**verificó contra la base de datos real** (consultas read-only con service-role y medición de
latencia del menú público).

Contexto que cambió desde la anterior: la consolidación T1-T8 está aplicada, hay un cliente real
cargado (Catire Kaffe, 59 productos) y el [plan comercial](PLAN_COMERCIAL.md) arranca pilotos.
La vara de la auditoría ya no es "¿está bien construido?" sino **"¿aguanta un turno real sin el
fundador presente?"**.

## Veredicto

La arquitectura de seguridad sigue siendo sólida y coincide con el documento: RLS aísla por local,
el total se calcula en Postgres, la service-role key no toca el navegador, hay máquina de estados y
19 tests. Verificado en vivo: el cliente anónimo **no** lee `pedidos` (0 filas, sin error).

**Los bloqueadores no son de seguridad: son de operación.** El sistema no aguantaba un turno
completo sin el fundador presente, y ninguno de los tres modos de falla principales aparece con
8 pedidos de prueba — aparecen todos el primer día real.

## Evidencia medida

| Medición | Resultado |
|---|---|
| Carga del menú `catirekaffe` (59 productos), fibra de escritorio | p50 **739 ms**, máx 1151 ms, 19,1 KB |
| Carga del menú `el-lalo` (20 productos) | p50 **406 ms**, máx 608 ms, 6,7 KB |
| Pedidos históricos en toda la plataforma | **8** |
| Locales en la base | 12, de los cuales **10 eran basura de tests** |
| Filas en `local_staff` | **2**, ambas del super-admin |
| Fotos de producto en Catire Kaffe | **0 de 59** |
| Lectura anónima de `pedidos` | 0 filas ✅ |
| Enumeración anónima de `locales` | devolvía los 12 ⚠️ |

## Hallazgos

### Bloqueantes de piloto

- **B1 — Catire Kaffe sin cuenta de dueño.** El local se sembró por script saltándose
  `/api/admin/onboard`; las únicas filas de `local_staff` eran del super-admin. El cliente no podía
  abrir su propio dashboard. → **F5.2**
- **B2 — 10 locales de prueba huérfanos y públicos.** `cleanupTestFixtures` envolvía la limpieza en
  un `catch` que solo hacía `console.error`: los tests pasaban en verde mientras dejaban locales
  vivos y enumerables en la base real. → **F5.1**
- **B3 — El selector de local mostraba locales sin acceso RLS.** Ser `platform_admin` no da acceso a
  los datos; la RLS exige fila en `local_staff`. Al elegir un local sin vínculo las consultas
  devolvían vacío **sin error**, indistinguible de "no hay pedidos". → **F5.3**
- **B4 — El Kanban no cargaba si el WebSocket no conectaba.** El primer fetch colgaba del callback
  `SUBSCRIBED`: con wifi que bloquea WebSockets, la cocina veía "Cargando dashboard…" hasta 30 s.
  → **F5.4**
- **B5 — Sin deshacer ni historial en cocina.** "Entregar" no pedía confirmación, a 8 px de
  "Rechazar" que sí la pedía, y `entregado` era terminal: un toque accidental borraba el pedido
  para siempre. → **F5.5**

### Altos

- **A1 — El rate-limit de 15 pedidos/min castiga el peak legítimo.** Es 1 cada 4 segundos: una
  apertura de mediodía con 10 mesas confirmando a la vez consume dos tercios del techo. → **F5.7**
- **A2 — Sin idempotencia: pedidos duplicados por reintento.** Si la RPC se ejecuta pero la
  respuesta se pierde en 4G, el carrito no se limpia y el cliente reintenta → dos pedidos idénticos
  a la cocina. Falta un `client_request_id UNIQUE`. → diferido a **F8**
- **A3 — Precios congelados en el carrito.** El carrito guarda una copia del producto (TTL 2 h) y el
  menú nunca se refresca tras la carga inicial. Un cambio de precio a mitad de servicio produce un
  total distinto al cobrado, o un error que no dice **cuál** producto se agotó. → diferido a **F7**
- **A4 — El sonido se apaga en silencio.** `soundEnabled` vivía en estado de React: cada recarga de
  la tablet devolvía la cocina al silencio. → **F5.6**
- **A5 — No existe el cierre de caja.** El plan comercial promete al dueño "este mes procesaste X
  pedidos"; hoy ese dato no se obtiene sin SQL. → diferido a **F6**

### Medios

- **M1 — `locales` enumerable por anónimos:** cualquiera lista la cartera completa de clientes. Se
  cierra solo al migrar el menú a Server Component. → **F7**
- **M2 — White-label a medias:** `order-status.tsx` tiene 0 usos de `var(--brand)` y 5 bloques
  naranja fijos. Con Catire (ámbar) coincide por suerte; con un local azul la pantalla de
  seguimiento se ve como otra app. → **F9**
- **M3 — El editor de identidad no valida contraste:** un color claro deja los CTAs con texto blanco
  ilegible. → **F9**
- **M4 — El Kanban de 4 columnas no cabía en la tablet típica:** `xl:` exige 1280 px; un iPad de
  10,9" en horizontal son 1180 px → 2 columnas. → **F5.4 (incluido)**
- **M5 — Bitácora desincronizada:** el commit `aad0143` no tenía entrada fechada.

## Simulación: fuente de soda de 12 mesas, 13:00-14:30

**Aguanta bien la escritura.** `crear_pedido` serializa por local con advisory lock y hace ~50-150 ms
de trabajo en Postgres; podría absorber cientos de pedidos por minuto. Los ~25-30 pedidos del turno
no son un problema técnico: el único techo era el rate-limit artificial (A1).

**Se siente lento al leer.** El camino hasta ver el primer producto es serial: HTML → bundle →
hidratar → consulta `locales` → consulta menú. Las dos oleadas ya cuestan 0,4-1,1 s **desde fibra**;
en un celular con 4G congestionado dentro de un local con muros, el tiempo realista hasta ver la
carta es de **3 a 6 segundos**. Migrar el menú a Server Component colapsa las dos oleadas en una
consulta que viaja dentro del HTML: objetivo **< 1,5 s**. Por eso el rendimiento subió en el
roadmap por delante de dominios propios.

**Se rompe** en B4 (cocina ciega 30 s), A2 (pedido duplicado) y B5 (toque accidental irreversible).

## Decisión de roadmap

El dueño del producto aprobó reordenar las fases: la antigua Fase 5 ("dominios propios") se movió al
final, y su lugar lo toma **[Fase 5 — Turno autónomo](F5-TURNO-AUTONOMO.md)**. El razonamiento: un
local de 12 mesas no paga por un dominio propio, pero sí decide renovar según si pudo operar solo
un mediodía.
