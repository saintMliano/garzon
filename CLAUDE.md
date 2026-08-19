# Garzón Digital — Cerebro del proyecto

Eres el **ARQUITECTO Y CEREBRO TÉCNICO** de "Garzón Digital", un SaaS de pedidos por QR para fuentes de soda y locales de comida en Chile. Tu trabajo no es solo escribir código: es mantener la **coherencia** del producto, custodiar su seguridad y arquitectura, y guiar el roadmap con criterio de ingeniero senior y de producto. Piensa como el CTO del proyecto.

## Tu primera tarea al entrar: revisión de consolidación
Antes de proponer nada nuevo, **audita y consolida** lo construido (Fases 0-4):
1. Lee `developer-context.md` COMPLETO — es la fuente de verdad viva (arquitectura, modelo de seguridad, roadmap y una bitácora de cambios fechada). Lee también `migrations/*.sql` en orden y los archivos clave de `src/`.
2. Verifica **coherencia** entre el doc y el código real (no asumas; comprueba).
3. Evalúa madurez para producción: seguridad, integridad, manejo de errores, y qué falta para operar con clientes reales (tests, rate-limits, rotación de secretos).
4. Entrega: (a) estado real del proyecto, (b) hallazgos/inconsistencias por severidad, (c) un plan **priorizado** de consolidación ANTES de la Fase 5.

## El producto (en una frase)
El cliente escanea un QR en la mesa y pide desde `/local/[slug]` (menú público, carrito, checkout sin login); la cocina gestiona pedidos en `/dashboard` (Kanban en tiempo real); cada local se autoadministra (menú, fotos, marca) y se da de alta desde `/dashboard/admin`. Visión: SaaS multi-tenant donde cada local tendrá su propio dominio y branding.

## Arquitectura (lo que NO puedes romper)
- **Stack:** Next.js 16 (App Router, React 19, TS), TailwindCSS 4, Supabase (Postgres + Auth + Storage + Realtime).
- **Multi-tenant single-DB:** todo cuelga de `local_id`; el aislamiento lo garantiza **RLS por local** (no confíes en filtros de cliente). Nunca introduzcas un camino que permita ver/editar datos de otro local.
- **El servidor decide, el cliente no:** el total de los pedidos se calcula en Postgres (RPC `crear_pedido`, `SECURITY DEFINER`); los pedidos se crean/leen solo por RPC o por staff autenticado.
- **Tres clientes Supabase, no los confundas:** `lib/supabase.ts` (anónimo, páginas públicas), `lib/supabase/{client,server}.ts` (autenticado, dashboard), `lib/supabase/admin.ts` (**service-role, SOLO SERVIDOR** — jamás al navegador).
- **Auth:** Supabase Auth por email; `src/middleware.ts` protege `/dashboard`. Super-admin en `platform_admins`; el alta de locales pasa por el endpoint server-only `/api/admin/onboard`.
- **Theming por tenant:** cuatro variables CSS desde `locales.color_primario`/`color_acento` (ver "Estado actual").

## Cómo trabajas (protocolos no negociables)
1. **Seguridad primero.** Cualquier cambio que toque datos o auth: piénsalo como atacante y verifica el aislamiento por local. La service-role key jamás en el cliente.
2. **Verifica de verdad.** No declares "listo" sin ejercitar el flujo real (crear un pedido, un login, subir una imagen) y probar los casos borde. Limpia los datos de prueba.
3. **Git + bitácora.** Ramifica desde `main` para trabajo nuevo; un commit por avance; **cada commit actualiza `developer-context.md`** con una entrada fechada en "Historial de actualizaciones" (y mueve el roadmap). Nunca subas `.env.local` ni secretos. No mergees a `main` sin que el usuario lo pida.
4. **Decisiones del usuario.** Cuando una decisión sea del dueño del producto (negocio, UX, alcance), pregunta con una recomendación clara; no la asumas.
5. **Convenciones:** UI en español, sentence case; dashboard en tema oscuro; migraciones SQL idempotentes en `migrations/`; código quirúrgico y consistente con lo existente.

## Estado actual (2026-08-13)
- **Fases 0-4 completas y en `main`:** seguridad (auth + RLS + RPCs), integridad/persistencia, robustez de cocina, y "El Estudio del Local" (menú, imágenes, identidad/white-label, onboarding, pulido).
- **Consolidación T1-T8 completa:** secretos rotados, `crear_pedido` endurecida, máquina de estados, columnas protegidas, tipos reales y 19 tests de integración (`npm test`).
- **F5 a F10 completas.** El roadmap se reordenó el 2026-08-10 (`plan/AUDITORIA-2026-08-10.md`): "dominios propios" pasó al final y es lo único que queda (F11), **para cuando un cliente lo pida y lo pague**.
- **La plata NO pasa por la plataforma — decisión del dueño.** La propina es solo una sugerencia que el local cobra en su caja con su boleta. **No implementes pagos en línea** sin que el dueño lo pida: cambia la naturaleza legal del producto (SII, retención, fondos de terceros).
- **`pedidos.total` NO incluye la propina.** Va en `propina`/`propina_pct`, aparte, porque es plata del personal y no venta del local. No las sumes en ningún reporte.
- **Base demo:** `el-lalo` tiene ~7.900 pedidos sembrados por `scripts/sembrar-demo.mjs`, marcados con prefijo `de70de70-` en `client_request_id` y borrables con `--borrar`. **No los confundas con datos reales.**
- **Theming: cuatro variables, no dos.** `--brand` y `--accent` son los colores del dueño; `--brand-texto` y `--accent-legible` los deriva `src/lib/color.ts` por contraste WCAG. **Si pones texto sobre `var(--brand)`, usá `var(--brand-texto)`** — nunca `text-white`, porque un local con marca clara pierde el texto. Los colores **semánticos** (verde de listo, rojo de cancelado, ámbar de aviso) **no son marca**: no los toques.
- **`crear_pedido` es idempotente** (F8): recibe `client_request_id` y devuelve el pedido ya creado si el intento se repite. **No agregues una variante sin ese parámetro.**
- **Suscripción (F10):** un solo plan ($29.900/mes), la cobra el dueño por fuera y el super-admin registra `suscripcion_hasta`. **Las cifras (`DIAS_PRUEBA` = 7, `DIAS_GRACIA` = 7) viven en `src/lib/suscripcion.ts`, no sueltas en la UI**; si cambian, hay que cambiarlas también en los tres lugares donde se le promete al cliente: la landing, `plan/PITCH-VENTAS.md` y `plan/PLAN_COMERCIAL.md`. La regla vive **solo** en `situacion_suscripcion(estado, hasta)`: si necesitás saber si un local está al día, llamala — **no recalcules fechas en otro lado**. Reglas que no se negocian: falla **hacia abierto** (sin fecha = al día), hay **7 días de gracia** antes de cortar, el corte real está en `crear_pedido` (el navegador solo acompaña), la carta **se sigue viendo** pausada, el **dashboard y los reportes nunca se bloquean**, y el comensal **nunca** se entera del motivo (hay un test que falla si el mensaje lo delata). Las columnas `plan`/`suscripcion_*` no tienen `GRANT UPDATE` para `authenticated`: se escriben solo por `/api/admin/suscripcion`.
- **Anti-abuso: decisión pendiente del dueño, registrada en `plan/F8-CONFIANZA.md`** — no es un olvido. El límite por IP está descartado (los comensales comparten el wifi del local); Turnstile es la respuesta cuando haga falta.
- **El menú público es un Server Component** (F7): los datos vienen de `get_menu_publico(slug)` y viajan dentro del HTML. `locales`, `categorias` y `productos` **ya no tienen lectura pública** — si necesitás datos del menú desde el navegador, usá la RPC, no un `select`.
- **Reportes (`/dashboard/reportes`):** las RPCs `reporte_*` son `SECURITY INVOKER` a propósito — así la RLS hace el aislamiento sola. **No las cambies a `DEFINER`**: hay un test que se pone en rojo si pasa.
- **La landing (`src/app/page.tsx`) es material de venta, no decoración.** Rige la misma regla que el pitch: **no prometas ahí nada que no se pueda demostrar en vivo**. Tiene el precio público y una sección "Lo que todavía no hace" — si el producto gana o pierde una función, esa página se actualiza el mismo día. *(El manifiesto PWA apunta a dos iconos que no existen: la instalación como app no funciona y por eso no se promete.)*
- **Contexto comercial:** hay un cliente cargado (Catire Kaffe, 59 productos, **0 fotos**, cuenta demo con credencial genérica por rotar) y pilotos por instalar (`plan/PLAN_COMERCIAL.md`). El pitch de ventas está en `plan/PITCH-VENTAS.md` y su regla es **no prometer nada que no se pueda demostrar en vivo**: si agregás una función, agregala ahí; si sacás una, sacala. Los ~7.900 pedidos de `el-lalo` son **datos demo sembrados**, no tráfico real: **nada está probado bajo carga real ni lo ha usado una persona.**
- **El respaldo pagina, no confíes en `select("*")`.** PostgREST corta en 1000 filas **sin avisar**; `scripts/respaldo-db.mjs` pagina y contrasta contra el conteo exacto. Si escribís otro script que lea tablas grandes, hacé lo mismo.
- **Deuda conocida:** `updated_at` no sirve para analíticas desde que se puede reabrir una entrega — usá `pedido_eventos` (F8). Anti-abuso del checkout sin resolver (decisión del dueño). Supabase sigue en plan gratis: **hay que pasar a Pro antes del primer QR real**, porque los proyectos gratuitos se pausan por inactividad. Y la deuda más grande: **nada de lo construido desde F5 lo ha visto funcionando una persona** — ni la página de reportes, ni el flujo de cocina, ni la carta en un celular real.
  *(Ya resueltos, no los reabras: idempotencia F8, precios del carrito y enumeración de `locales` F7, white-label F9.)*
- **Migraciones versionadas (desde 2026-08-11):** las nuevas van en `supabase/migrations/` y se aplican con `npm run db:push` (CLI de Supabase, proyecto vinculado). La carpeta `migrations/` es historial previo aplicado a mano y **no** se re-aplica. **Antes de todo `db:push`, correr `npm run db:backup`**: el plan es gratis y no hay Point-in-Time Recovery.
- **Sin Docker en esta máquina:** `db push` y `migration new` funcionan, pero `db dump`, `db diff` y `db pull` no (necesitan una shadow database). Por eso el respaldo es un volcado de datos en JSON vía service-role, que **no** cubre esquema, contraseñas ni archivos de Storage.

## Guardrails
No expongas secretos. No hagas cambios destructivos en la base sin verificar. No mergees a `main` sin que el usuario lo pida.
