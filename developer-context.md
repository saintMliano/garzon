# Garzón Digital - Contexto de Diseño y Desarrollo

Este documento sirve como transferencia de contexto de diseño (UX/UI) y arquitectura de desarrollo para que cualquier instancia de IA o desarrollador pueda continuar el proyecto sin perder la línea conceptual.

> **Última actualización (2026-07-09):** implementadas las Fases 0-3 del plan de endurecimiento y la **Fase 4 completa (4.1-4.5)** — "El Estudio del Local": gestión de menú, imágenes, identidad visual, onboarding de locales y pulido. Ver [Seguridad y Arquitectura de Datos](#-seguridad-y-arquitectura-de-datos), [Estado Actual](#-estado-actual-y-próximos-pasos) y el [Historial de actualizaciones](#-historial-de-actualizaciones) al final.

---

## 🎨 Contexto de UX/UI y Diseño Visual

### Concepto de Marca y Producto
- **Garzón Digital:** Es una solución de digitalización de pedidos para restaurantes y fuentes de soda. Permite a los clientes pedir desde la mesa escaneando un código QR y al local gestionar todo desde una pantalla en la cocina sin intermediarios ni comisiones.
- **Estilo Visual:**
  - **Modo Oscuro del Dashboard (`dashboard-dark`):** Diseñado específicamente para pantallas de cocina y tablets. Reduce la fatiga visual bajo luces intensas y destaca los pedidos con colores semánticos.
  - **Acento Energizante:** Degradados cálidos de naranja a ámbar (`from-orange-500 to-amber-500`) que evocan dinamismo, velocidad y apetito.

### Detalles de Micro-UX e Interacción en el Dashboard
El panel de cocina cuenta con detalles interactivos avanzados para simular un sistema nativo de punto de venta:
1. **Notificación Sonora Nativa (`playNotificationSound`):** Genera un pitido electrónico doble utilizando la API de `AudioContext` del navegador de forma puramente matemática (sin archivos de audio externos que puedan fallar en cargar). *(Pendiente Fase 2: desbloquear el AudioContext con un gesto del usuario para que suene en tablets sin interacción previa.)*
2. **Temporizador Dinámico de Alerta (`TimerBadge`):** Muestra los minutos y segundos transcurridos desde que se hizo el pedido. Cambia de color dinámicamente según la demora del pedido:
   - **Gris/Neutral:** Menos de 8 minutos.
   - **Ámbar (Advertencia):** Entre 8 y 15 minutos.
   - **Rojo (Peligro/Retrasado):** Más de 15 minutos.
3. **Retroalimentación Háptica:** Utiliza la API de vibración del navegador (`navigator.vibrate`) en dispositivos compatibles al detectar un nuevo pedido.
4. **Pestaña del Navegador Dinámica:** Cambia el título de la página para alertar al cocinero si está en otra pestaña: `(Cantidad de nuevos) 🔔 Nuevo Pedido | Garzón Digital`.

### Flujo Kanban de Cocina
Los pedidos avanzan secuencialmente a través de 4 columnas interactivas:
- **Nuevos** ➡️ **Aceptados** ➡️ **En Cocina** ➡️ **Listos** ➡️ *Entregado* (se archiva fuera del dashboard activo).

### Flujo del Cliente (móvil-primero)
1. El cliente entra a `/local/[slug]` (idealmente por QR), navega el menú y arma su carrito.
2. **El carrito persiste en `localStorage`** (clave `garzon:cart:<slug>`, TTL 2h): una recarga o el descarte de la pestaña en móvil ya no lo pierden.
3. Al confirmar, el checkout crea el pedido de forma atómica y muestra una pantalla de **seguimiento en vivo** con barra de progreso.
4. **El pedido activo también persiste** (`garzon:order:<slug>`, TTL 3h): si el cliente recarga, se restaura la pantalla de seguimiento; cuando el pedido pasa a `entregado`, se limpia solo y vuelve al menú.

---

## 🛠️ Stack Tecnológico y Arquitectura de Desarrollo

### Tecnologías Principales
- **Framework:** Next.js 16 (App Router, React 19, TypeScript).
- **Estilos:** TailwindCSS 4 con variables personalizadas para el modo oscuro (`dashboard-dark`).
- **Base de Datos y Tiempo Real (Core):** Supabase (Postgres + Realtime). El dashboard usa canales en tiempo real (`supabase.channel().on('postgres_changes')`) para recibir pedidos sin recargar la página.
- **Autenticación:** Supabase Auth (email + contraseña) para el personal de cocina, con `@supabase/ssr` para gestión de sesión vía cookies. El acceso al dashboard está protegido a nivel de servidor.

### Clientes de Supabase (¡importante!)
El proyecto usa **dos** clientes según el contexto:
- `src/lib/supabase.ts` — cliente **anónimo** (clave pública). Lo usan las páginas públicas del cliente: menú, checkout (llamando RPCs) y seguimiento del pedido. Solo puede leer el menú público y ejecutar las dos RPCs permitidas; **no** puede leer ni escribir la tabla `pedidos` directamente.
- `src/lib/supabase/client.ts` y `src/lib/supabase/server.ts` — clientes **autenticados** (`@supabase/ssr`) que leen la sesión desde cookies. Los usa el dashboard de cocina para que las políticas RLS reconozcan al usuario y filtren por su local.

### Estructura de Base de Datos (Supabase)
Esquema base en [`supabase-schema.sql`](supabase-schema.sql); migraciones de endurecimiento en la carpeta [`migrations/`](migrations/).

**Tablas:**
- **`locales`:** Multi-tenant; cada local tiene `slug` único, nombre, dirección, color de marca, etc.
- **`categorias` / `productos`:** Catálogo del menú por local (con precios, disponibilidad y orden). Lectura pública (el menú es público).
- **`pedidos`:** Número de pedido, mesa, nombre del cliente, total, notas y estado (`nuevo`, `aceptado`, `preparando`, `listo`, `entregado`). **Acceso público revocado** (ver Seguridad).
- **`pedido_items`:** Ítems de cada pedido (cantidad, notas específicas y `precio_unitario`). **Acceso público revocado.**
- **`local_staff` (nueva):** Vincula usuarios de `auth.users` con `locales` (`user_id`, `local_id`). Determina qué local ve/gestiona cada cuenta de cocina. Se administra por SQL/rol de servicio.

**Integridad:** las FK `local_id` (categorias/productos/pedidos) y `pedido_id` (pedido_items) son `NOT NULL`. Hay `CHECK` en `precio > 0`, `total > 0`, `cantidad > 0` y `precio_unitario >= 0`.

### Funciones RPC (contrato del cliente anónimo)
El cliente anónimo **no** toca la tabla `pedidos` directamente; opera vía dos funciones `SECURITY DEFINER`:
- **`crear_pedido(p_local_id, p_nombre, p_mesa, p_notas, p_items jsonb) → uuid`**: crea el pedido y sus ítems en una sola transacción, **calcula el total en el servidor** leyendo el precio real de `productos` (ignora cualquier total enviado por el cliente), valida que el local esté activo y que cada producto exista y esté `disponible`. Devuelve el id del pedido.
- **`get_order_status(p_order_id) → (estado, numero_pedido, created_at)`**: expone solo campos no sensibles del pedido cuyo UUID conoce el cliente (para el seguimiento).

### Estructura de Carpetas Clave
- `src/app/page.tsx`: Landing page comercial que presenta el servicio.
- `src/app/login/page.tsx`: Login del personal de cocina (email + contraseña).
- `src/proxy.ts`: Middleware de Next 16 (convención `proxy`, antes `middleware`). Refresca la sesión y **redirige a `/login` si se accede a `/dashboard` sin sesión**.
- `src/app/dashboard/page.tsx`: Tablero Kanban de cocina. Usa el cliente autenticado, resuelve el `local_id` del usuario vía `local_staff`, y **filtra todas las consultas y la suscripción realtime por `local_id`**. Incluye botón de cerrar sesión y muestra el nombre real del local.
- `src/app/local/[slug]/`: Ruta dinámica del cliente. `page.tsx` (menú + persistencia), `checkout-modal.tsx` (llama `crear_pedido`), `order-status.tsx` (seguimiento vía `get_order_status` + **polling cada 4s**, ya no realtime), `cart-sheet.tsx`, `layout.tsx` (envuelve con `CartProvider`).
- `src/lib/cart-context.tsx`: Contexto del carrito, **persistido en `localStorage`** por slug.
- `src/lib/supabase.ts` / `src/lib/supabase/{client,server}.ts`: clientes anónimo y autenticados (ver arriba).
- `migrations/`: migraciones SQL idempotentes de endurecimiento (`fase0-auth-rls.sql`, `fase1-integridad.sql`).

---

## 🔒 Seguridad y Arquitectura de Datos

El principio rector tras la auditoría: **el servidor decide, el navegador no.** Las tres decisiones sensibles (identidad, precio y qué se puede modificar) viven en Postgres, no en el cliente.

- **Autenticación de cocina:** `/dashboard` requiere sesión (Supabase Auth). Sin login, `proxy.ts` redirige a `/login`.
- **Aislamiento multi-tenant (RLS):** las políticas públicas de `pedidos` y `pedido_items` fueron **eliminadas**. Ahora:
  - Solo el **staff autenticado** puede leer/actualizar los pedidos **de su propio local** (RLS que verifica `auth.uid()` contra `local_staff`).
  - El **cliente anónimo** solo puede crear pedidos y consultar el estado del suyo, a través de las RPCs. No puede leer pedidos ajenos, modificarlos ni insertarlos directamente.
  - `locales`, `categorias` y `productos` mantienen lectura pública (el menú es público).
- **Precio a prueba de manipulación:** `crear_pedido` recalcula el total en el servidor; un cliente no puede enviar un pedido con total falso.
- **Realtime:** el dashboard (autenticado) mantiene realtime filtrado por `local_id`. El seguimiento del **cliente** usa polling porque, al cerrar la lectura pública, el anónimo ya no recibe eventos `postgres_changes` de `pedidos`.

> **Cuenta demo:** el local `el-lalo` está vinculado en `local_staff` a la cuenta del dueño (login por email + contraseña). Las credenciales no se versionan.

---

## 🚀 Estado Actual y Próximos Pasos

### Implementado
- [x] Landing page del producto.
- [x] Menú dinámico móvil-primero con carrito de compras **persistente**.
- [x] Dashboard Kanban de cocina con integración Supabase en tiempo real, **protegido por autenticación y aislado por local**.
- [x] Alertas sonoras, hápticas y de pestaña dinámicas para nuevos pedidos.
- [x] Temporizadores visuales con alertas semánticas de retraso por pedido.
- [x] **Fase 0 — Seguridad:** Supabase Auth + RLS por local + RPCs (`crear_pedido`, `get_order_status`); tabla `local_staff`.
- [x] **Fase 1 — Integridad y persistencia:** total calculado en servidor, `NOT NULL`/`CHECK` en el esquema, carrito y pedido activo persistidos en `localStorage`, arreglo del spinner infinito con slug inválido, blindaje del modal de checkout.
- [x] **Fase 2 — Robustez de cocina:** reconexión de realtime (callback de estado + refetch en `SUBSCRIBED`) + polling de respaldo (30s) + refetch en `visibilitychange`/`online`; se quitó el filtro de medianoche del Kanban (las estadísticas del día excluyen cancelados); actualizaciones de estado con compare-and-set y aviso de error; desbloqueo del sonido por gesto (botón "Activar sonido"); estado `cancelado` con botón "Rechazar" en cocina y pantalla terminal para el cliente.
- [x] **Fase 3 — Multi-tenant real:** numeración de pedidos **por local, reiniciada por día** (antes `SERIAL` global; ahora se calcula en `crear_pedido` bajo advisory lock); lectura de `?mesa=` desde el QR (mesa pre-seleccionada y bloqueada) y **mesas configurables por local** (`locales.mesas`); imágenes de productos movidas a datos (`productos.imagen_url`, se eliminó el mapa `FALLBACK_IMAGES` del código); slug demo de la landing por variable de entorno (`NEXT_PUBLIC_DEMO_SLUG`). *(El SEO/metadata por local se pospuso porque depende de migrar el menú a Server Component; ahora vive en la Fase 6.)*
- [x] **Fase 4.1 — Gestión de menú self-service:** panel en `/dashboard/menu` para crear/editar/eliminar categorías y productos, fijar precios y **toggle de disponibilidad** ("se acabó la palta"), respaldado por RLS de escritura por staff (`fase4-1-menu-rls.sql`). Incluye 2 quick wins: búsqueda del menú tolerante a tildes e índice en `categorias(local_id)`.
- [x] **Fase 4.2 — Imágenes:** bucket público `menu` en Supabase Storage con RLS por local (`fase4-2-storage.sql`); control de subida de foto en el editor de producto; el menú del cliente sirve las imágenes con `next/image` (locales y remotas de Storage).
- [x] **Fase 4.3 — Identidad visual (white-label):** editor en `/dashboard/config` (nombre, slogan, dirección, teléfono, color primario, **color de acento**, logo); el menú del cliente se pinta por tenant vía las variables CSS `--brand` (CTAs) y `--accent` (precios), muestra el logo (`logo_url`) y el slogan (`locales.slogan`). Todo el flujo del cliente (menú + carrito + checkout) queda marcado.

### Pendiente / Futuro

- [ ] **Consolidación pre-Fase 5** (prioridad actual): auditoría hecha el 2026-07-10; hallazgos y
  plan ejecutable de 8 tareas (T1 rotación de secretos … T8 tests de integración) en
  [`plan/`](plan/README.md). Ninguna tarea ejecutada aún.

**Fase 4 — "El Estudio del Local" (self-service, prioridad actual)** — que un dueño arme y personalice su local sin SQL:
- [x] **4.1** — Gestión de menú (categorías/productos, precios, disponibilidad).
- [x] **4.2** — Imágenes: subida a Supabase Storage + `next/image` (fotos de productos; el logo se conectará en la 4.3).
- [x] **4.3** — Identidad visual del local (logo, color, textos); el menú del cliente se pinta por tenant (white-label sin dominio propio aún).
- [x] **4.4** — Onboarding de locales (super-admin):
  - [x] **4.4.a** — Base de seguridad: tabla `platform_admins`, endpoint server-only `POST /api/admin/onboard` (crea cuenta+local+vínculo+semilla) con service-role key y verificación de super-admin.
  - [x] **4.4.b** — Pantalla de alta `/dashboard/admin` (solo super-admin): formulario nombre/slug/email + **logo del local** (se sube server-side en el endpoint), y tarjeta con las credenciales del dueño + links.
- [x] **4.5** — Pulido: trigger `updated_at` en pedidos (server-side), clamp del temporizador de cocina ante desfase de reloj, y `.env.example`.

- [ ] **Fase 5 — Dominios propios:** columna `dominio` en `locales`, enrutado por `Host` en `proxy.ts`, SSL automático (al cerrar un cliente que lo pida).
- [ ] **Fase 6 — Calidad, rendimiento y SEO:** menú como Server Component, metadata/SEO por local (`generateMetadata`), tipos generados con `supabase gen types`.
- [ ] **Fase 7 — Marca profunda (cuando haya cliente):** que el cliente perciba más la marca del local dentro de la app — página de información/historia, equipo/personal, y theming más rico. Se profundizará con el caso real del primer cliente.
- [ ] Módulo de pago en línea (Webpay / Stripe) opcional antes de procesar el pedido.
- [ ] Control de stock (inventario) automático al vender productos.
- [ ] Analíticas históricas de venta diaria/mensual.

---

## 📝 Historial de actualizaciones

> Bitácora de cambios. **Protocolo:** cada actualización del repositorio (commit) agrega aquí una entrada con la fecha y un resumen de lo que cambió.

### 2026-07-10 — Revisión de consolidación + plan ejecutable (`plan/`)
- **Auditoría completa de Fases 0-4** (doc vs. código real: migraciones, RPCs, RLS, Storage,
  onboarding, flujo cliente/cocina). Veredicto: arquitectura declarada = código real; apto para
  demo/piloto, **no** para producción. Hallazgos por severidad en [`plan/AUDITORIA.md`](plan/AUDITORIA.md):
  1 crítico (secretos por rotar), 3 altos (crear_pedido sin rate-limit/topes, sin máquina de
  estados y staff puede editar cualquier columna de pedidos, staff puede editar slug/activo de su
  local), 6 medios y 4 bajos.
- **Plan de consolidación ejecutable** en [`plan/`](plan/README.md): 8 tareas autocontenidas
  (T1-T8) con SQL/código exacto, criterios de aceptación, verificación y guardrails, diseñadas
  para que modelos/desarrolladores menos capaces las ejecuten sin re-decidir arquitectura; más
  esbozos de F5/F6 en `plan/backlog/`. Solo documentación: cero cambios de código o base en este
  commit.

### 2026-07-10 — Consolidación T3: máquina de estados de pedidos
- Trigger `validar_transicion_pedido` (migración `consolidacion-t3-maquina-estados.sql`): valida en el servidor las transiciones del Kanban (nuevo→aceptado/cancelado, aceptado→preparando/cancelado, preparando→listo/cancelado, listo→entregado); rechaza saltos/reversas.
- Privilegios de columna: `REVOKE UPDATE ON pedidos` + `GRANT UPDATE (estado) TO authenticated` — el staff solo puede tocar `estado`, no `total` ni otras columnas. La RLS de Fase 0 sigue decidiendo las filas.
- Verificado: transición inválida rechazada, válida permitida; staff bloqueado al actualizar `total` (permission denied) y habilitado para avanzar `estado`. (Plan: T3.)

### 2026-07-10 — Consolidación T2: crear_pedido v4 (endurecido)
- `crear_pedido` (migración `consolidacion-t2-crear-pedido-v4.sql`): lee el precio de cada producto UNA sola vez (fija carrera total↔items), usa `bigint` + tope de $10.000.000 por pedido (evita overflow del `int`), acota tamaños (cantidad ≤ 99, ≤ 50 productos, largos de nombre/mesa/notas) y agrega rate-limit de 15 pedidos por local por minuto bajo el advisory lock (anti-spam anónimo).
- Cliente: `checkout-modal.tsx` muestra un mensaje claro ante el rate-limit.
- Verificado: pedido normal (items = total), cantidad 100 y tope de monto rechazados, 16º pedido/minuto bloqueado. (Plan: T2.)

### 2026-07-10 — CLAUDE.md (cerebro del proyecto)
- Se agregó `CLAUDE.md` en la raíz: contexto/persona que cualquier instancia de IA (Fable 5 u otra) carga automáticamente al abrir el repo — establece el rol de "arquitecto/cerebro", la arquitectura intocable, los protocolos (seguridad, verificación, git+bitácora) y la primera tarea (revisión de consolidación). No cambia código de la app.

### 2026-07-10 — Fase 4.5: Pulido (cierre de la Fase 4)
- **Trigger `updated_at`:** `pedidos.updated_at` se mantiene en el servidor ante cualquier UPDATE (`fase4-5-updated-at.sql`, función `set_updated_at`); se quitó el seteo manual desde el dashboard. Base para analíticas de tiempos.
- **Temporizador de cocina:** el `TimerBadge` acota el tiempo a ≥ 0 (`Math.max(0, …)`) para no mostrar valores negativos con desfase de reloj de la tablet.
- **`.env.example`:** documenta las variables requeridas (incluida `SUPABASE_SERVICE_ROLE_KEY` server-only) para futuros setups/deploys.

### 2026-07-09 — Fase 4.4.b: Pantalla de alta de locales
- **UI `/dashboard/admin`** (pestaña "Alta de local"): visible con gate cliente (chequea `platform_admins`) + gate real en el servidor. Formulario nombre / slug autosugerido / email del dueño / **logo del local** (opcional), y tarjeta de resultado con email + contraseña temporal (botones "Copiar") y links a menú/dashboard.
- **Logo en el alta:** como el super-admin no es staff del local nuevo (la RLS de Storage lo bloquearía desde el cliente), el logo se envía como data URL al endpoint y **se sube server-side con la service-role key**; se setea `locales.logo_url`. Best-effort: si falla, el alta igual continúa.
- **Verificado:** alta por UI → tarjeta de credenciales; alta con logo → `logo_url` seteado y públicamente accesible (HTTP 200). Datos de prueba limpiados (locales, usuarios y objetos de Storage).

### 2026-07-09 — Fase 4.4.a: Base de seguridad del onboarding
- **Rol de super-admin:** tabla `platform_admins` (`fase4-4a-platform-admins.sql`) con RLS "cada quien lee solo su fila". Solo el super-admin (el dueño de la plataforma) puede dar de alta locales.
- **Endpoint server-only** `POST /api/admin/onboard`: verifica sesión + membresía en `platform_admins` (403 si no), y con la **service-role key** crea la cuenta del dueño (contraseña temporal), el `local`, el vínculo `local_staff` y una semilla mínima de categorías; con rollback ante fallo. Valida slug único y email.
- **Aislamiento de la llave:** `SUPABASE_SERVICE_ROLE_KEY` es server-only (`.env.local`, sin prefijo `NEXT_PUBLIC_`, gitignored); el cliente admin vive en `src/lib/supabase/admin.ts` y solo lo importa el route handler. Nunca llega al navegador.
- **Verificado con rigor:** no-admin autenticado → 403; slug/email duplicados → 409; input inválido → 400; super-admin → 200 (crea local+dueño+semilla, consistentes en la base). Datos de prueba limpiados.

### 2026-07-09 — Fase 4.3.1: Color de acento configurable
- **Segundo color de marca** `locales.color_acento` (`fase4-3-1-color-acento.sql`, default naranja) editable por el dueño en `/dashboard/config` (selector picker+hex, junto al primario).
- **Precios por marca:** el menú define la variable CSS `--accent = color_acento`; los precios (menú, carrito, checkout) la usan. Así el dueño controla dos colores: `--brand` (CTAs) y `--accent` (precios/detalles). Resuelve el pendiente del color de precio de la 4.3.
- **Theming completo del flujo del cliente:** se llevaron a `var(--brand)` los CTAs que quedaban naranjas en carrito/checkout ("Confirmar Pedido", "Enviar Pedido", mesa seleccionada). Verificado: primario naranja + acento verde → botones naranjas y precios verdes.

### 2026-07-09 — Fase 4.3: Identidad visual del local (white-label)
- **Columna `slogan`** en `locales` (`fase4-3-branding.sql`); el-lalo sembrado con una tagline demo. `color_primario` y `logo_url` ya existían.
- **Editor `/dashboard/config`** (pestaña "Identidad"): nombre, slogan, dirección, teléfono, selector de color primario (picker + hex sincronizados) y subida de logo (reutiliza Storage de la 4.2). Guarda con `UPDATE locales` (RLS de staff).
- **Menú pintado por tenant:** el contenedor del menú define la variable CSS `--brand = color_primario`; los CTAs (botón +, barra "Ver pedido", pill de categoría activa, botón de carrito) usan `var(--brand)`. El header muestra el `logo_url` si existe (fallback al emoji) y el `slogan` bajo la dirección.
- *Nota:* el color del precio sigue en naranja fijo (fuera del alcance de esta tanda); ajuste menor pendiente si se quiere 100% white-label.

### 2026-07-08 — Fase 4.2: Imágenes de productos
- **Supabase Storage:** bucket público `menu` (`fase4-2-storage.sql`) con RLS — lectura pública, y escritura del staff scopeada por la primera carpeta de la ruta = `local_id` (`<local_id>/<archivo>`).
- **Subida en el editor de producto:** control para subir foto (guarda en Storage con el cliente autenticado y persiste la URL pública en `productos.imagen_url`), con vista previa y opción de quitar.
- **`next/image`:** el menú del cliente sirve las imágenes optimizadas; `next.config.ts` habilita `remotePatterns` para `*.supabase.co/storage/v1/object/public/**` (funciona con imágenes locales y remotas de Storage).
- **Fix visual:** la perilla del toggle de disponibilidad ahora queda centrada dentro del riel (le faltaba la clase `left` de posición).

### 2026-07-08 — Fase 4.1: Gestión de menú self-service
- **Panel de menú** (`/dashboard/menu`): pestaña nueva en el dashboard para gestionar el menú sin SQL. Dos paneles (categorías / productos), crear/editar/eliminar de ambos, precios, `orden`, y **toggle de disponibilidad** con actualización optimista (el caso "se acabó la palta").
- **Permisos de escritura (RLS):** `categorias`, `productos` y `locales` pasan de solo-lectura pública a permitir escritura del **staff autenticado** de cada local (`fase4-1-menu-rls.sql`), mismo patrón que `pedidos`. Todas las operaciones del panel usan el cliente autenticado (`@supabase/ssr`).
- **Quick wins:** búsqueda del menú tolerante a tildes (`normalizar()` en `utils.ts`) e índice `idx_categorias_local`.
- *(La subida de imágenes queda para la Fase 4.2.)*

### 2026-07-08 — Fase 3: Multi-tenant real
- **Numeración por local, reiniciada por día:** se quitó el `SERIAL` global de `numero_pedido`; ahora `crear_pedido` asigna el correlativo por local (hora de Chile) bajo `pg_advisory_xact_lock` para evitar colisiones (migración `fase3-multitenant.sql`).
- **Mesa por QR + mesas configurables:** el menú lee `?mesa=` de la URL y la pasa al checkout pre-seleccionada y bloqueada ("📍 … · Detectada por el código QR"); las opciones de mesa salen de `locales.mesas` (columna nueva `text[]`), con fallback por defecto. *Convención: el QR debe codificar la etiqueta completa, p. ej. `?mesa=Mesa%205`.*
- **Sin hardcodes del tenant demo:** se eliminó el mapa `FALLBACK_IMAGES` del código; las fotos ahora vienen de `productos.imagen_url` (pobladas en la base). El enlace demo de la landing usa `NEXT_PUBLIC_DEMO_SLUG` (fallback `el-lalo`).

### 2026-07-08 — Fase 2: Robustez de cocina
- **Realtime resiliente en el dashboard:** suscripción con callback de estado (refetch en `SUBSCRIBED`, cubre carga inicial y reconexiones), polling de respaldo cada 30s y refetch al recuperar visibilidad/conexión (`visibilitychange`/`online`).
- **Sin filtro de medianoche:** el Kanban trae todos los pedidos `estado NOT IN ('entregado','cancelado')` sin recorte por fecha; las estadísticas del día excluyen cancelados.
- **Actualizaciones de estado seguras:** `updateStatus` usa compare-and-set (`.eq('estado', actual)`), muestra aviso de error y re-sincroniza; botón deshabilitado mientras el request está en vuelo.
- **Sonido desbloqueado por gesto:** `AudioContext` singleton + botón "Activar sonido" en el header.
- **Rechazo de pedidos:** nuevo estado `cancelado` (migración `fase2-cancelado.sql`), botón "Rechazar" en cocina y pantalla terminal "Pedido cancelado" para el cliente.

### 2026-07-08 — Fase 1: Integridad y persistencia
- `NOT NULL` en las FK (`categorias`/`productos`/`pedidos.local_id`, `pedido_items.pedido_id`) y `CHECK` de precio/total/cantidad (migración `fase1-integridad.sql`).
- Carrito y pedido activo persistidos en `localStorage` por local (sobreviven a recargas; auto-limpieza al entregar).
- Arreglo del spinner infinito con slug inválido; blindaje del modal de checkout contra doble envío.

### 2026-07-08 — Fase 0: Seguridad y multi-tenant
- Autenticación de cocina (Supabase Auth + `@supabase/ssr` + `proxy.ts`), tabla `local_staff` y RLS por local (migración `fase0-auth-rls.sql`).
- Se cerró el acceso público a `pedidos`/`pedido_items`; el cliente anónimo opera solo vía RPCs `crear_pedido` (total en servidor) y `get_order_status`.
