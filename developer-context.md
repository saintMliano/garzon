# Garzón Digital - Contexto de Diseño y Desarrollo

Este documento sirve como transferencia de contexto de diseño (UX/UI) y arquitectura de desarrollo para que cualquier instancia de IA o desarrollador pueda continuar el proyecto sin perder la línea conceptual.

> **Última actualización (2026-08-10):** auditoría 2 + Fase 5 "Turno autónomo" en curso (roadmap reordenado). Ver [Historial de actualizaciones](#-historial-de-actualizaciones) al final.

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
- **Nuevos** ➡️ **Aceptados** ➡️ **En Cocina** ➡️ **Listos** ➡️ *Entregado* (sale del Kanban activo).

**Red de seguridad (F5.5):** marcar "Entregado" saca el pedido de la pantalla, así que ese paso deja
un toast de **Deshacer** (12 s) y el pedido queda en el panel **"Cerrados hoy"** con botón
**Reabrir** (transición `entregado → listo`). En una cocina los toques accidentales existen y antes
no había vuelta atrás. `cancelado` sigue siendo terminal: el cliente ya vio esa pantalla.

**Estado de la conexión:** el header muestra `En vivo` / `Conectando` / `Sin conexión`, para poder
distinguir "no hay pedidos" de "no me están llegando".

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
El proyecto usa **tres** clientes según el contexto:
- `src/lib/supabase.ts` — cliente **anónimo** (clave pública). Lo usan las páginas públicas del cliente: menú, checkout (llamando RPCs) y seguimiento del pedido. Solo puede leer el menú público y ejecutar las dos RPCs permitidas; **no** puede leer ni escribir la tabla `pedidos` directamente.
- `src/lib/supabase/client.ts` y `src/lib/supabase/server.ts` — clientes **autenticados** (`@supabase/ssr`) que leen la sesión desde cookies. Los usa el dashboard de cocina para que las políticas RLS reconozcan al usuario y filtren por su local.
- `src/lib/supabase/admin.ts` — cliente **admin** (service-role key, **SOLO SERVIDOR**). Bypassa RLS y opera auth admin. Únicamente lo importa el route handler `/api/admin/onboard`; jamás debe llegar a un client component.

### Estructura de Base de Datos (Supabase)
Esquema base en [`supabase-schema.sql`](supabase-schema.sql); migraciones de endurecimiento en la carpeta [`migrations/`](migrations/).

**Tablas:**
- **`locales`:** Multi-tenant; cada local tiene `slug` único, nombre, dirección, color de marca, `mesas`, y `limite_pedidos_min` (tope de pedidos/minuto que aplica `crear_pedido`, default 40).
- **`categorias` / `productos`:** Catálogo del menú por local (con precios, disponibilidad y orden). Lectura pública (el menú es público).
- **`pedidos`:** Número de pedido, mesa, nombre del cliente, total, notas y estado (`nuevo`, `aceptado`, `preparando`, `listo`, `entregado`, `cancelado`). **Acceso público revocado** (ver Seguridad).
- **`pedido_items`:** Ítems de cada pedido (cantidad, notas específicas y `precio_unitario`). **Acceso público revocado.**
- **`local_staff` (nueva):** Vincula usuarios de `auth.users` con `locales` (`user_id`, `local_id`). Determina qué local ve/gestiona cada cuenta de cocina. Se administra por SQL/rol de servicio.
- **`platform_admins`:** marca qué usuarios son super-admins de la plataforma (pueden dar de alta locales vía `/api/admin/onboard`). RLS: cada quien lee solo su fila; se administra por service-role.

**Integridad:** las FK `local_id` (categorias/productos/pedidos) y `pedido_id` (pedido_items) son `NOT NULL`. Hay `CHECK` en `precio > 0`, `total > 0`, `cantidad > 0` y `precio_unitario >= 0`.

### Funciones RPC (contrato del cliente anónimo)
El cliente anónimo **no** toca la tabla `pedidos` directamente; opera vía dos funciones `SECURITY DEFINER`:
- **`crear_pedido(p_local_id, p_nombre, p_mesa, p_notas, p_items jsonb) → uuid`**: crea el pedido y sus ítems en una sola transacción, **calcula el total en el servidor** leyendo el precio real de `productos` **una sola vez** (ignora cualquier total enviado por el cliente), valida que el local esté activo y que cada producto exista y esté `disponible`. **Endurecida (T2):** topes de tamaño (cantidad ≤ 99, ≤ 50 productos, monto ≤ $10M) y `bigint` para evitar overflow. **Rate-limit configurable (F5.2):** el tope por local por minuto se lee de `locales.limite_pedidos_min` (default 40; antes era fijo en 15, que un peak legítimo reventaba). Devuelve el id del pedido.
  > **Limitación conocida:** el rate-limit protege de ráfagas accidentales, no de un atacante decidido — que igual satura y de paso deja fuera a los clientes buenos. La defensa real es un desafío/token de sesión en el checkout (Fase 8).
- **`get_order_status(p_order_id) → (estado, numero_pedido, created_at)`**: expone solo campos no sensibles del pedido cuyo UUID conoce el cliente (para el seguimiento).

**Actualización de pedidos:** el staff solo puede cambiar la columna `estado` (privilegios de columna), y un trigger valida las transiciones del Kanban en el servidor (`nuevo→aceptado/cancelado`, `aceptado→preparando/cancelado`, `preparando→listo/cancelado`, `listo→entregado`, y `entregado→listo` para deshacer una entrega marcada por error). Las columnas `slug`/`activo`/`limite_pedidos_min` de `locales` y el `total` de `pedidos` no son actualizables por el staff (quedan al service-role).
> **Efecto secundario de la reapertura:** el ciclo `entregado → listo → entregado` reescribe `updated_at` vía el trigger `set_updated_at`, así que esa columna **no** es una base confiable para analíticas de tiempos. La auditoría de cambios de estado que la reemplaza va en la Fase 8.

### Estructura de Carpetas Clave
- `src/app/page.tsx`: Landing page comercial que presenta el servicio.
- `src/app/login/page.tsx`: Login del personal de cocina (email + contraseña).
- `src/proxy.ts`: Middleware de Next 16 (convención `proxy`, antes `middleware`). Refresca la sesión y **redirige a `/login` si se accede a `/dashboard` sin sesión**.
- `src/app/dashboard/page.tsx`: Tablero Kanban de cocina. Usa el cliente autenticado, resuelve el `local_id` del usuario vía `local_staff`, y **filtra todas las consultas y la suscripción realtime por `local_id`**. Incluye botón de cerrar sesión y muestra el nombre real del local.
- `src/app/dashboard/menu/page.tsx`: gestión self-service del menú (categorías, productos, precios, disponibilidad, fotos).
- `src/app/dashboard/config/page.tsx`: identidad visual del local (nombre, slogan, colores, logo).
- `src/app/dashboard/admin/page.tsx`: alta de locales (solo super-admin; el link se oculta a quien no lo es).
- `src/app/api/admin/onboard/route.ts`: endpoint server-only de onboarding (usa el cliente admin / service-role).
- `src/app/local/[slug]/`: Ruta dinámica del cliente. `page.tsx` (menú + persistencia), `checkout-modal.tsx` (llama `crear_pedido`), `order-status.tsx` (seguimiento vía `get_order_status` + **polling cada 4s**, 15s al llegar a `listo`, hasta `entregado`/`cancelado`), `cart-sheet.tsx`, `layout.tsx` (envuelve con `CartProvider`).
- `src/lib/cart-context.tsx`: Contexto del carrito, **persistido en `localStorage`** por slug.
- `src/lib/supabase.ts` / `src/lib/supabase/{client,server}.ts` / `src/lib/supabase/admin.ts`: clientes anónimo, autenticados y admin (ver arriba).
- `supabase/migrations/`: **migraciones versionadas (desde el 2026-08-11).** Se aplican con
  `npm run db:push`, que corre solo las pendientes y deja registro en la propia base
  (`supabase_migrations.schema_migrations`). Es la carpeta viva: toda migración nueva va acá.
- `migrations/`: **historial previo, ya aplicado a mano.** Se conserva como registro de cómo se
  llegó al esquema actual. No se re-aplica y no se agregan archivos nuevos.
- `scripts/`: utilidades de operación que corren con la service-role key (**solo local, nunca en el cliente**):
  - `limpiar-datos-test.mjs` — borra locales `test-local-*` y usuarios `@test.garzon` huérfanos. Dry-run por defecto; `--borrar` ejecuta.
  - `crear-cuenta-local.mjs <slug> <email> [password]` — crea/repara la cuenta de acceso de un local que ya existe y verifica con un login real. Para altas nuevas usar `/dashboard/admin`.
  - `seed-catirekaffe.js` — semilla del menú de un cliente concreto.

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
- **Endurecimiento (consolidación T2-T4):** `crear_pedido` con rate-limit por local y topes de tamaño/monto; el staff solo puede cambiar la columna `estado` de sus pedidos (transiciones validadas por trigger en el servidor), no el `total`; no puede cambiar `slug`/`activo` de su local; el bucket `menu` limita tamaño (3 MB) y tipos (solo imágenes).

> **Cuenta demo:** el local `el-lalo` está vinculado en `local_staff` a la cuenta del dueño (login por email + contraseña). Las credenciales no se versionan.

> **Limitación conocida (onboarding):** el rollback de `/api/admin/onboard` es compensatorio (best-effort), no transaccional: si el borrado compensatorio falla puede quedar un usuario o local huérfano; se detecta buscando filas de `locales` sin fila asociada en `local_staff`.

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

- [x] **Consolidación pre-Fase 5:** auditoría del 2026-07-10 y plan de 8 tareas (T1 rotación de
  secretos … T8 tests de integración) en [`plan/`](plan/README.md). **Las 8 completas.**

**Roadmap reordenado (2026-08-10).** Tras la [segunda auditoría](plan/AUDITORIA-2026-08-10.md), el
dueño del producto aprobó mover "dominios propios" al final: un local de 12 mesas no paga por un
dominio propio, pero sí decide renovar según si pudo operar solo un mediodía.

| Fase | Contenido | Estado |
|---|---|---|
| **F5 — Turno autónomo** | Que un local opere un turno completo sin el fundador: cuentas reales, deshacer entrega, historial del día, carga sin realtime, aviso de sonido, rate-limit configurable. [Plan](plan/F5-TURNO-AUTONOMO.md) | **Completa** |
| **F6 — Cierre de caja** | `/dashboard/reportes`: pedidos, venta, ticket promedio, top productos, ventas por día y export CSV. [Plan](plan/F6-CIERRE-DE-CAJA.md) | **Completa** |
| F7 — Rendimiento percibido | Menú a Server Component, `generateMetadata`/SEO por local, refresco de menú y reconciliación de precios del carrito | Pendiente |
| F8 — Confianza | Idempotencia de `crear_pedido` (`client_request_id`), auditoría de cambios de estado, defensa anti-abuso en el checkout | Pendiente |
| F9 — Marca completa | Terminar el white-label (`order-status.tsx` sigue naranja fijo), validar contraste en el editor de identidad | Pendiente |
| F10 — Negocio | Propina sugerida, planes/suscripción, pago en línea | Pendiente |
| F11 — Dominios propios | Cuando un cliente lo pida **y lo pague** | Pendiente |

**Fase 4 — "El Estudio del Local" (self-service, completa)** — que un dueño arme y personalice su local sin SQL:
- [x] **4.1** — Gestión de menú (categorías/productos, precios, disponibilidad).
- [x] **4.2** — Imágenes: subida a Supabase Storage + `next/image` (fotos de productos; el logo se conectará en la 4.3).
- [x] **4.3** — Identidad visual del local (logo, color, textos); el menú del cliente se pinta por tenant (white-label sin dominio propio aún).
- [x] **4.4** — Onboarding de locales (super-admin):
  - [x] **4.4.a** — Base de seguridad: tabla `platform_admins`, endpoint server-only `POST /api/admin/onboard` (crea cuenta+local+vínculo+semilla) con service-role key y verificación de super-admin.
  - [x] **4.4.b** — Pantalla de alta `/dashboard/admin` (solo super-admin): formulario nombre/slug/email + **logo del local** (se sube server-side en el endpoint), y tarjeta con las credenciales del dueño + links.
- [x] **4.5** — Pulido: trigger `updated_at` en pedidos (server-side), clamp del temporizador de cocina ante desfase de reloj, y `.env.example`.

*(Las antiguas Fases 5-7 se reordenaron en la tabla de arriba: "dominios propios" pasó a F11,
"calidad/SEO/Server Components" a F7 y "marca profunda" se repartió entre F7 y F9.)*

**Backlog sin fase asignada:**
- [ ] Cargador masivo de fotos del menú (arrastrar N fotos, emparejado automático por nombre +
  manual, redimensionado en el navegador respetando EXIF). Acelera el onboarding de un cliente
  nuevo de horas a minutos — Catire Kaffe tiene 59 productos y 0 fotos.
- [ ] Control de stock (inventario) automático al vender productos.
- [ ] Página de información/historia del local (marca profunda, con cliente real).

---

## 📝 Historial de actualizaciones

> Bitácora de cambios. **Protocolo:** cada actualización del repositorio (commit) agrega aquí una entrada con la fecha y un resumen de lo que cambió.

### 2026-08-11 — Fase 6: cierre de caja (`/dashboard/reportes`)

Resuelve el hallazgo **A5**: el plan comercial le promete al dueño "este mes procesaste X pedidos" y
ese dato no se podía obtener sin abrir una consola SQL. Plan y decisiones en
[`plan/F6-CIERRE-DE-CAJA.md`](plan/F6-CIERRE-DE-CAJA.md).

- **Tres RPCs de agregación** (`reporte_ventas`, `reporte_ventas_por_dia`, `reporte_top_productos`),
  migración `20260811173951_f6_reportes_ventas.sql`. La agregación vive en Postgres, no en el
  navegador: bajar un mes de pedidos a una tablet para producir seis números escala mal.
- **`SECURITY INVOKER`, al revés que `crear_pedido`.** Esa es `DEFINER` porque *tiene* que serlo (el
  anónimo no tiene permisos sobre `pedidos`). Acá quien llama es staff autenticado que ya puede leer
  lo suyo, así que dejándolas INVOKER **la RLS hace el aislamiento sola**: consultar el `local_id` de
  otro devuelve ceros, no datos. No hay privilegio extra que se pueda escapar ni verificación de
  membresía propia que mantener correcta. `anon` no tiene EXECUTE.
- **Página `/dashboard/reportes`:** rangos (hoy / ayer / 7 días / este mes / mes pasado /
  personalizado), tarjetas de venta-pedidos-ticket, desglose entregados vs pendientes vs rechazados,
  ventas por día y top 10 de productos. Sin librería de gráficos: barras en CSS. Link agregado a la
  nav de las 4 páginas del dashboard.
- **Exportación a CSV** del detalle del período (`;` + BOM para Excel en español), paginada y con
  aviso si se topa el límite: un CSV recortado en silencio se lee como completo y con eso el dueño
  concilia una caja a la que le faltan datos.
- **Todo en hora de Chile**, incluido el manejo del cambio de horario: verificado que el 4 de abril
  de 2026 dura 25 h y el 6 de septiembre 23 h — ese día la medianoche no existe y se resuelve hacia
  adelante, igual que Postgres, para que el CSV y las RPCs cubran exactamente la misma ventana.
- **Tipos regenerados desde la base** (`npm run db:types`) en vez de mantenerlos a mano. Destapó dos
  cosas: el banner de `dotenv` se colaba por stdout dentro del archivo generado (silenciado con
  `quiet: true` en los cuatro scripts), y el checkout le pasaba `null` a `p_mesa`/`p_notas` de
  `crear_pedido`, cuyos argumentos `text` el generador declara no-nulos. Ahora manda cadena vacía: la
  RPC ya hace `NULLIF(trim(...), '')`, así que se guarda `NULL` igual.
- **Verificación:** `npm test` **34/34** (22 + 12 nuevos), build y `tsc` limpios, 0 huérfanos. El
  aislamiento se probó contra la base real *antes* de escribir la UI: la cuenta de Catire consultando
  El Lalo recibe ceros mientras el service-role ve $67.900 en ese local. Hay un test que lo fija.
- **Pendiente:** la revisión visual de la página con datos reales. Requiere iniciar sesión en el
  dashboard, cosa que no puedo hacer yo.

### 2026-08-10 — Auditoría 2 + Fase 5 "Turno autónomo" (roadmap reordenado)

- **Segunda auditoría** ([`plan/AUDITORIA-2026-08-10.md`](plan/AUDITORIA-2026-08-10.md)), esta vez
  verificando contra la **base real** y no solo contra el código. Hallazgos: 5 bloqueantes de
  piloto, 5 altos, 5 medios. La seguridad seguía sana (el anónimo no lee `pedidos`); los
  bloqueadores eran **de operación**.
- **Roadmap reordenado** por decisión del dueño: "dominios propios" se va al final (F11) y su lugar
  lo toma **F5 — Turno autónomo** ([plan](plan/F5-TURNO-AUTONOMO.md)), cuyo criterio de aceptación
  es que un local opere un turno completo sin el fundador presente.
- **F5.1 — Limpieza y causa raíz:** borrados 10 locales `test-local-*` huérfanos (con 15 productos,
  `activo=true` y públicamente enumerables) y 2 usuarios `@test.garzon`. `cleanupTestFixtures`
  tragaba los fallos en un `catch` silencioso: los tests pasaban en verde mientras ensuciaban la
  base. Ahora acumula fallos, verifica locales **y** usuarios, y lanza excepción. Nuevo
  `scripts/limpiar-datos-test.mjs` (dry-run por defecto).
- **F5.2 — Cuenta de acceso para Catire Kaffe:** el local se había sembrado por script y no tenía
  dueño (las únicas filas de `local_staff` eran del super-admin). Nuevo
  `scripts/crear-cuenta-local.mjs`, que además **verifica con un login real**. Credencial genérica
  mientras sea demo; **rotar antes de entregarla al cliente**.
- **F5.3 — Selector de local por `local_staff`:** las 3 páginas del dashboard listaban *todos* los
  locales si el usuario era `platform_admin`, pero la RLS exige fila en `local_staff`: los locales
  sin vínculo mostraban una cocina vacía **sin error**. Decisión: no se amplió la RLS para
  `platform_admins` — eso debilitaría la única regla de aislamiento por comodidad de una pantalla.
- **F5.4 — Carga inicial sin depender de realtime:** el primer fetch colgaba del callback
  `SUBSCRIBED`; con wifi que bloquea WebSockets la cocina veía "Cargando dashboard…" hasta 30 s.
  Además: indicador de conexión en el header, y **fix de un bug latente del commit `aad0143`** — el
  topic del canal era fijo (`dashboard-orders`) y `channel()` reutiliza el canal existente, así que
  al cambiar de local el `.subscribe()` era un no-op y el local nuevo se quedaba sin realtime.
  También se agregó guarda contra respuestas en vuelo del local anterior (podían dejar el header en
  un local y el Kanban en otro). Kanban a 4 columnas desde `lg` (1024px): en `xl` un iPad de 10,9"
  caía a 2 columnas.
- **F5.5 — Deshacer entrega:** migración `f5-1-reapertura-pedidos.sql` (transición
  `entregado → listo`), toast de deshacer (12 s) y panel "Cerrados hoy" con botón Reabrir.
- **F5.6 — Aviso persistente de sonido:** barra roja a ancho completo mientras el audio no esté
  activo, y sondeo del `AudioContext` cada 5 s (el navegador lo suspende por su cuenta).
- **F5.7 — Rate-limit configurable:** migración `f5-2-rate-limit-configurable.sql`, columna
  `locales.limite_pedidos_min` (default 40, antes fijo en 15) leída por `crear_pedido` v5.
- **Tests:** 4 nuevos (reapertura, reapertura acotada, límite por defecto, límite configurable).
- **Revisión adversarial** del diff completo por un segundo agente antes de dar nada por hecho; de
  ahí salieron el fix del canal de realtime, la guarda de respuestas en vuelo y 6 defectos más.
- **Pipeline de migraciones (CLI de Supabase):** se acabó el copiar/pegar SQL en el editor. El
  proyecto quedó vinculado y las migraciones nuevas viven en `supabase/migrations/`, aplicadas con
  `npm run db:push` — que corre **solo las pendientes** y deja registro en la base. Motivo: hasta
  hoy `migrations/` era una declaración de intenciones y nadie podía responder "¿esta base tiene la
  migración T4?" sin ir a mirar. Con 5 pilotos eso es cómo se te cae uno.
  - **Línea base:** no se pudo hacer `db pull` (necesita Docker), así que el historial previo
    **no** se importó: `migrations/` queda como registro de cómo se llegó al esquema actual y el
    versionado arranca desde `f5-1`/`f5-2`.
  - **Respaldo (plan gratis, sin PITR):** `npm run db:backup` vuelca los datos a `backups/`
    (gitignoreado) vía service-role. No cubre esquema, contraseñas ni Storage — para eso hace falta
    Docker o el plan Pro. Regla: respaldar **antes** de cada `db:push`.
  - `scripts/con-env.mjs` pasa las credenciales por entorno y no por argumento, para que la clave
    de Postgres no quede en el historial del shell ni en la lista de procesos.
- **Verificación:** `npm test` **22/22** (19 previos − 1 reemplazado + 4 nuevos), `npm run build` y
  `tsc` limpios, y `scripts/limpiar-datos-test.mjs` confirma **0 huérfanos** tras la corrida.
- **Riesgo operativo anotado:** los proyectos gratis de Supabase se pausan por inactividad (ya pasó
  el 2026-07-21). Con QRs impresos en mesas de un local real, eso es un cliente escaneando y no
  viendo nada. Pasar a Pro **el día que se instale el primer piloto**, no después.

### 2026-07-22 — Consolidación T1: Rotación de secretos completada
- **Rotación de Service-Role Key:** `SUPABASE_SERVICE_ROLE_KEY` fue regenerada en Supabase y actualizada en Vercel, `.env.local` y `.env.test`. Las claves expuestas en historiales previos quedaron revocadas e invalidadas (`HTTP 401`).
- **Reset de Contraseña de Postgres:** Restablecida la clave directa de Postgres en Supabase Dashboard.
- **Reset de Contraseña Super-Admin:** Actualizada la contraseña del usuario super-admin (`emiliogalvez14@gmail.com`) en Supabase Auth mediante la API de administración.
- **Verificación:** Ejecución limpia de `npm test` (19/19 tests pasados) validando autenticación, aislamiento RLS y permisos del servidor con las credenciales rotadas.

### 2026-07-22 — Consolidación T8: Suite de tests de integración (Vitest)
- **Suite de tests de integración (`tests/`):** Implementada la suite completa de 19 tests automatizados contra la API real de Supabase utilizando Vitest.
- **Fixtures e integración limpia (`tests/setup.ts`):** Creación y limpieza automatizada en cascada de locales (`test-local-a-<ts>`), categorías, productos, usuarios de prueba en Auth y vínculos `local_staff`, garantizando estado neutro sin datos huérfanos.
- **Cobertura de invariantes de seguridad:**
  - `tests/rls-aislamiento.test.ts`: RLS de lectura/escritura anónima bloqueada, aislamiento multi-tenant estricto entre staff de distintos locales, restricción de UPDATE en `total` (T3) y `slug`/`activo` (T4).
  - `tests/crear-pedido.test.ts`: RPC `crear_pedido` con recálculo de total en servidor, rechazo de productos ajenos/no disponibles, tope de 99 unidades, 50 ítems y rate-limit de 15 pedidos/min (T2).
  - `tests/estados.test.ts`: Transición secuencial del Kanban (`nuevo` ➡️ `aceptado` ➡️ `preparando` ➡️ `listo` ➡️ `entregado`) y rechazo de saltos o reversas inválidas por el trigger Postgres (T3).
  - `tests/get-order-status.test.ts`: Consulta de estado pública por UUID y respuesta segura ante UUID inexistente.
- **Verificación:** `npm test` verde en ejecuciones consecutivas (19/19 tests pasados).

### 2026-07-21 — Fix de Supabase + optimización de Middleware y menú cliente
- **Re-activación de Supabase:** Se verificó la reactivación del proyecto en Supabase (`https://jrffaxuvxzitzlqdwroy.supabase.co`), resolviendo el error `ENOTFOUND` que bloqueaba las consultas.
- **`src/middleware.ts` (optimizado):** Se reemplazó `src/proxy.ts` por `src/middleware.ts` con evaluación condicional: sólo invoca `supabase.auth.getUser()` en rutas de `/dashboard` o si hay cookies de auth activas (`sb-*`). Las visitas públicas al menú (`/local/[slug]`) ya no sufren latencia de autenticación.
- **Redirección automática a `/login`:** El dashboard (`/dashboard`, `/dashboard/menu`, `/dashboard/config`, `/dashboard/admin`) redirige a `/login` al detectar que no hay usuario en sesión cliente, evitando pantallas en blanco o "Sin local asociado" al perder la sesión.
- **Carga en paralelo en `/local/[slug]`:** `categorias` y `productos` ahora se consultan en paralelo con `Promise.all()`, reduciendo a la mitad la latencia de carga del menú.
- **Scroll spy en el menú público:** Se sincronizó la barra de categorías superior con el scroll de la página utilizando `requestAnimationFrame`. La categoría visible actualmente en pantalla se resalta automáticamente y la barra horizontal se desplaza de forma fluida para centrar la categoría activa.

### 2026-07-12 — Consolidación T7: tipado real de Supabase
- **Tipado estricto de base de datos:** creado `src/types/supabase.ts` con la estructura del esquema de Supabase, y modificado `src/types/database.ts` para exportar `Database` desde allí.
- **Tipado de interfaz Producto:** cambiada la propiedad `categoria_id` a nullable (`string | null`) para reflejar la restricción `ON DELETE SET NULL` de Postgres.
- **Solución de compatibilidad de tipos:** corregida la asignación de `categoria_id` en el formulario de edición de productos en el dashboard del menú, y añadidos casts explícitos a `Local`, `Categoria[]` y `Producto[]` al setear los estados correspondientes en la página del local.
- **Validación:** compilado exitoso (`npm run build`) bajo tipado estricto de TypeScript.

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

### 2026-07-10 — Consolidación T6: coherencia documental
- Sincronizado `developer-context.md` con el código real: **tres** clientes Supabase (se agregó `admin.ts`); tabla `platform_admins` y estado `cancelado` en el modelo de datos; rutas de la Fase 4 (`dashboard/{menu,config,admin}`, `/api/admin/onboard`, `lib/supabase/admin.ts`) en la estructura de carpetas; reflejo del endurecimiento T2-T4 (rate-limit/topes de `crear_pedido`, máquina de estados, columnas protegidas de `locales`, límites del bucket) en RPCs/Seguridad; y una nota de la limitación conocida del rollback del onboarding. Solo documentación. (Plan: T6.)

### 2026-07-10 — Consolidación T5: fixes del cliente
- **Seguimiento hasta `entregado`:** `order-status.tsx` ahora sigue sondeando en `listo` (a 15 s) y solo se detiene en `entregado`/`cancelado`; así el cliente ve la entrega y la auto-limpieza (`onDelivered`) por fin ocurre en el flujo normal (antes se detenía en `listo` y nunca la disparaba).
- **Stats con hora de Chile:** el dashboard calcula la medianoche del día en `America/Santiago` (consistente con la numeración de pedidos), no con la zona de la tablet.
- **Link "Alta de local" solo para super-admin:** las 4 páginas del dashboard consultan `platform_admins` y ocultan el link a quien no es admin (la página ya estaba gateada; esto es solo visibilidad).
- Verificado: pedido llevado hasta entregado → el cliente vuelve solo al menú y limpia el `localStorage`; el no-admin no ve "Alta de local". (Plan: T5.)

### 2026-07-10 — Consolidación T4: columnas protegidas de locales + límites de Storage
- Privilegios de columna en `locales` (migración `consolidacion-t4-locales-storage.sql`): `REVOKE UPDATE` + `GRANT UPDATE` solo sobre las 8 columnas de branding/operación (nombre, slogan, direccion, telefono, logo_url, color_primario, color_acento, mesas). El staff ya no puede cambiar `slug` ni `activo` (quedan al service-role).
- Bucket `menu`: `file_size_limit` 3 MB + `allowed_mime_types` solo imágenes (antes el límite solo existía en el endpoint de onboarding).
- El editor `/dashboard/config` ya enviaba solo columnas permitidas (no requirió cambio de cliente).
- Verificado: staff edita branding OK, pero `slug`/`activo` → permission denied; subida > 3 MB rechazada por el bucket. (Plan: T4.)

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
