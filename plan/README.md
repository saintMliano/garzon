# Plan de consolidación (pre-Fase 5)

Este directorio es el **plan ejecutable** de consolidación de Garzón Digital, producido por la
revisión de consolidación del 2026-07-10 (ver [`AUDITORIA.md`](AUDITORIA.md)). Las tareas están
diseñadas para que **cualquier modelo/desarrollador las ejecute sin re-decidir la arquitectura**:
cada tarea es autocontenida, trae el código/SQL exacto o casi exacto, criterios de aceptación y
pasos de verificación.

## Protocolo del ejecutor (obligatorio)

1. **Lee `CLAUDE.md` y esta página completa antes de empezar.** No improvises fuera del alcance
   de la tarea.
2. **Una tarea = una rama = un commit** (o pocos commits atómicos). Ramifica desde `main`:
   `git checkout main && git pull && git checkout -b consolidacion/<id-tarea>`.
3. **Sigue la tarea al pie de la letra.** Si algo del código real contradice la tarea, DETENTE y
   repórtalo; no "arregles" sobre la marcha.
4. **Verifica de verdad** con los pasos de la sección "Verificación" de la tarea (ejercita el
   flujo real). Limpia todos los datos de prueba que crees.
5. **Cada commit actualiza `developer-context.md`**: agrega una entrada fechada al inicio del
   "Historial de actualizaciones" y marca la tarea como hecha en este plan (checkbox de abajo).
6. **Nunca** subas `.env.local` ni secretos, **nunca** uses la service-role key en código de
   cliente, **nunca** merges a `main` sin que el dueño lo pida.
7. Las migraciones SQL van en `migrations/` con nombre `consolidacion-<id>.sql`, **idempotentes**
   (patrón `DROP POLICY IF EXISTS` / `CREATE OR REPLACE` / `DO $$ ... EXCEPTION WHEN duplicate_object`).
   Se aplican en el SQL Editor de Supabase (no hay pipeline de migraciones automático).

## Orden de ejecución

Las tareas P1 (T2, T3, T4) son independientes entre sí; se pueden hacer en cualquier orden o en
paralelo (ramas separadas). T8 (tests) va al final porque debe cubrir las reglas nuevas.

| # | Tarea | Prioridad | Tipo | Estado |
|---|-------|-----------|------|--------|
| T1 | [Rotación de secretos](tareas/T1-rotacion-secretos.md) | **P0 — bloqueante producción** | Manual (dueño) + checklist | [ ] |
| T2 | [Endurecer `crear_pedido` (rate-limit + topes + fix de carrera)](tareas/T2-endurecer-crear-pedido.md) | P1 | SQL | [x] |
| T3 | [Máquina de estados de pedidos + restringir UPDATE a `estado`](tareas/T3-maquina-estados-pedidos.md) | P1 | SQL | [x] |
| T4 | [Proteger columnas de `locales` + límites del bucket](tareas/T4-proteger-locales-y-storage.md) | P1 | SQL | [x] |
| T5 | [Fixes del cliente (polling a entregado, stats con hora de Chile, link admin)](tareas/T5-fixes-cliente.md) | P2 | TypeScript | [x] |
| T6 | [Coherencia documental de `developer-context.md`](tareas/T6-coherencia-docs.md) | P2 | Docs | [x] |
| T7 | [Tipos reales de la base (`Database`)](tareas/T7-tipos-generados.md) | P3 | TypeScript | [x] |
| T8 | [Suite mínima de tests de integración](tareas/T8-tests-integracion.md) | P3 | Tests | [x] |

Después de T1–T8 el proyecto queda listo para retomar el roadmap normal:
[Fase 5 — dominios propios](backlog/F5-dominios-propios.md) y
[Fase 6 — calidad/SEO/Server Components](backlog/F6-calidad-seo.md).

## Reglas de arquitectura que ninguna tarea puede romper

- Multi-tenant single-DB: el aislamiento lo garantiza **RLS por `local_id`**, nunca filtros de cliente.
- El servidor decide: totales y numeración solo en Postgres (RPC `crear_pedido`, `SECURITY DEFINER`).
- Tres clientes Supabase: `lib/supabase.ts` (anónimo), `lib/supabase/{client,server}.ts`
  (autenticado), `lib/supabase/admin.ts` (service-role, **solo servidor**).
- UI en español, sentence case; dashboard en tema oscuro.
