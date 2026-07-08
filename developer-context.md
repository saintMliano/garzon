# Garzón Digital - Contexto de Diseño y Desarrollo

Este documento sirve como transferencia de contexto de diseño (UX/UI) y arquitectura de desarrollo para que cualquier instancia de IA o desarrollador pueda continuar el proyecto sin perder la línea conceptual.

> **Última actualización (2026-07-08):** implementadas las Fases 0-3 del plan de endurecimiento y la **Fase 4.1** (panel de gestión de menú self-service). Ver [Seguridad y Arquitectura de Datos](#-seguridad-y-arquitectura-de-datos), [Estado Actual](#-estado-actual-y-próximos-pasos) y el [Historial de actualizaciones](#-historial-de-actualizaciones) al final.

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

### Pendiente / Futuro

**Fase 4 — "El Estudio del Local" (self-service, prioridad actual)** — que un dueño arme y personalice su local sin SQL:
- [x] **4.1** — Gestión de menú (categorías/productos, precios, disponibilidad).
- [ ] **4.2** — Imágenes: subida a Supabase Storage + `next/image` (fotos de productos y logo).
- [ ] **4.3** — Identidad visual del local (logo, color, textos); el menú del cliente se pinta por tenant (white-label sin dominio propio aún).
- [ ] **4.4** — Onboarding: crear un local + su cuenta de dueño desde una pantalla (super-admin; usa service-role key en el servidor).
- [ ] **4.5** — Pulido (trigger de `updated_at` y otros quick wins).

- [ ] **Fase 5 — Dominios propios:** columna `dominio` en `locales`, enrutado por `Host` en `proxy.ts`, SSL automático (al cerrar un cliente que lo pida).
- [ ] **Fase 6 — Calidad, rendimiento y SEO:** menú como Server Component, metadata/SEO por local (`generateMetadata`), tipos generados con `supabase gen types`.
- [ ] Módulo de pago en línea (Webpay / Stripe) opcional antes de procesar el pedido.
- [ ] Control de stock (inventario) automático al vender productos.
- [ ] Analíticas históricas de venta diaria/mensual.

---

## 📝 Historial de actualizaciones

> Bitácora de cambios. **Protocolo:** cada actualización del repositorio (commit) agrega aquí una entrada con la fecha y un resumen de lo que cambió.

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
