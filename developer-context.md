# Garzón Digital - Contexto de Diseño y Desarrollo

Este documento sirve como transferencia de contexto de diseño (UX/UI) y arquitectura de desarrollo para que cualquier instancia de IA o desarrollador pueda continuar el proyecto sin perder la línea conceptual.

> **Última actualización (2026-08-26):** **WhatsApp** en la landing y el volante, con texto oscuro sobre el verde porque el blanco da 1,98:1. Antes, el mismo día: **Volante A6** en `marketing/`, con el QR real incrustado y verificado a toda resolución de impresión. Antes, el mismo día: **`npm run qr`** — los códigos de las mesas, en SVG y con corrección `Q`, verificados decodificándolos. Antes, el mismo día: **Correo propio** — `contacto@garzondigital.cl` con Cloudflare Email Routing, y por fin visible en la landing. Antes, el mismo día: **Dominio propio** `garzondigital.cl`, comprado en NIC Chile — DNS en Cloudflare por el correo, y el `metadataBase` que le faltaba a la imagen de OpenGraph (ver [`plan/DOMINIO.md`](plan/DOMINIO.md)). Antes, el mismo día: **Rediseño de la landing** (`src/app/page.tsx`): la página que le vende al dueño ahora **muestra el producto** en vez de solo describirlo — el tablero de la cocina bajo el hero y los reportes de venta en su propia sección, como réplicas en HTML de las pantallas reales (`src/componentes/landing/`). Antes de eso (2026-08-20): Fases 5 a 10 completas. Lo último: **roles por local (F12)** — `dueño` y `personal`, con los permisos hechos cumplir por la base (RLS + guardas en las RPC de reportes), pantalla de **equipo** para dar de alta gente, y la **comanda del garzón** (`/dashboard/comanda`). Antes de eso: teléfono del comensal con su tratamiento de datos personales, y cambio de contraseña. Queda **F11 — dominios propios**, para cuando un cliente lo pida y lo pague. Ver [Historial de actualizaciones](#-historial-de-actualizaciones) al final.

---

## 🎨 Contexto de UX/UI y Diseño Visual

### Concepto de Marca y Producto
- **Garzón Digital:** Es una solución de digitalización de pedidos para restaurantes y fuentes de soda. Permite a los clientes pedir desde la mesa escaneando un código QR y al local gestionar todo desde una pantalla en la cocina sin intermediarios ni comisiones.
- **Estilo Visual:**
  - **Modo Oscuro del Dashboard (`dashboard-dark`):** Diseñado específicamente para pantallas de cocina y tablets. Reduce la fatiga visual bajo luces intensas y destaca los pedidos con colores semánticos.
  - **Acento Energizante:** Degradado cálido de naranja a ámbar (`from-orange-500 to-amber-500`), que evoca dinamismo, velocidad y apetito. **Desde el 2026-08-24 no se escribe suelto:** vive en `.btn-primario` y se usa una sola vez por pantalla. Antes estaba 39 veces —once de ellas en la comanda— y cuando todo lo relevante se ve igual, deja de haber jerarquía.

### Sistema de diseño (consolidado el 2026-08-24)

Lo que antes se decidía a ojo en cada pantalla ahora tiene reglas escritas, después de la auditoría de frontend. Las cuatro que importan:

- **Contraste.** `src/lib/color.ts` deriva el texto legible sobre el color de cada local por contraste WCAG. Esa misma regla rige ahora para el naranja de la plataforma, que no lo hacía: los botones primarios llevan `text-stone-900`, no `text-white`. En la carta el piso de gris es `text-stone-500`; en el panel, `dash-text-muted` (`#9c948c`).
- **Escala tipográfica.** La de Tailwind más `text-2xs` (11px), que es solo del panel y solo para rótulos. En la carta el piso es `text-xs` (12px), y los campos de formulario van en `text-base` (16px) para que Safari de iOS no haga zoom al enfocarlos. **No se escribe `text-[Npx]`.**
- **Tres niveles de botón.** `btn-primario` / `btn-secundario` / `btn-terciario`, uno solo primario por pantalla o diálogo.
- **Diálogos.** `src/componentes/modal.tsx` (rol, foco atrapado, Escape, devolución del foco) y `src/componentes/usar-confirmar.tsx`, que reemplazó a `window.confirm()`. No se abre una ventana con `fixed inset-0` a mano.
- **Las maquetas de la landing son espejos, y se desfasan.** `src/componentes/landing/`
  reconstruye en HTML dos pantallas del panel —el tablero (`/dashboard`) y los
  reportes (`/dashboard/reportes`)— para mostrarlas en la página de venta. Usan
  las clases reales, no una imitación. **Si tocás alguna de esas dos pantallas,
  pasá por `src/componentes/landing/` antes de cerrar el commit:** si no, la
  landing va a estar enseñando algo que ya no existe. Los datos son inventados y
  cuadran entre sí; `tests/landing-demo.test.ts` falla si alguien retoca un
  número suelto y deja de cuadrar.
- **Iconos.** `@heroicons/react` (`24/outline` por defecto). Antes convivían trazados copiados a mano y emoji haciendo de interfaz. **El emoji de las categorías es contenido del cliente y no se toca:** lo elige el dueño en `/dashboard/menu` y se guarda en `categorias.icono`.
- **Tipografía.** Inter la carga `next/font/google` desde el layout, autoalojada. No vuelve a entrar por `@import` de Google Fonts.

Los bloques comentados de `src/app/globals.css` tienen el detalle y el porqué de cada uno.

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
1. El cliente entra a `/local/[slug]` (idealmente por QR), navega el menú y arma su carrito. **El menú se renderiza en el servidor** (F7): la carta viaja dentro del HTML, sin esperar a que el celular ejecute JavaScript ni haga consultas.
2. **El carrito persiste en `localStorage`** (clave `garzon:cart:<slug>`, TTL 2h): una recarga o el descarte de la pestaña en móvil ya no lo pierden. Al cargar el menú se **reconcilia** contra los precios vigentes y se avisa al cliente de cualquier cambio (F7).
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
- **`locales`:** Multi-tenant; cada local tiene `slug` único, nombre, dirección, color de marca, `mesas`, y `limite_pedidos_min` (tope de pedidos/minuto que aplica `crear_pedido`, default 40). **Suscripción (F10):** `plan`, `suscripcion_estado` (`prueba|activa|cortesia|cancelada`), `suscripcion_hasta` y `suscripcion_notas`. Esas cuatro columnas **no tienen GRANT UPDATE para `authenticated`**: solo se escriben por `/api/admin/suscripcion` con service-role.
- **`categorias` / `productos`:** Catálogo del menú por local (con precios, disponibilidad y orden). **Lectura pública revocada (F7):** el menú se sirve por `get_menu_publico(slug)`; el staff lee las suyas por RLS.
- **`pedidos`:** Número de pedido, mesa, nombre del cliente, total, notas, estado (`nuevo`, `aceptado`, `preparando`, `listo`, `entregado`, `cancelado`), `client_request_id` (idempotencia, F8) y `propina`/`propina_pct` (F10). **`total` NO incluye la propina**: son plata distinta. **`telefono` y `tipo_entrega`** (2026-08-19): el teléfono es un **dato personal** en E.164, solo en retiros, sin `GRANT UPDATE` para el staff y **borrado automáticamente a los 7 días** por `borrar_telefonos_antiguos` (agendada con `pg_cron`). No lo agregues a exportaciones ni a RPCs públicas. **Acceso público revocado** (ver Seguridad). **`creado_por` (F12):** quién tomó el pedido; lo rellena un trigger con `auth.uid()`, así que es NULL para el comensal anónimo y el id del staff cuando viene de la comanda. Sin `GRANT UPDATE` para el staff: un registro que el interesado puede reescribir no sirve de nada.
- **`pedido_items`:** Ítems de cada pedido (cantidad, notas específicas y `precio_unitario`). **Acceso público revocado.**
- **`pedido_eventos` (F8):** bitácora de cambios de estado (`estado_anterior`, `estado_nuevo`, `actor`, `created_at`). La escribe un trigger; por RLS es **solo lectura** y solo del propio local. Base de los tiempos reales de cocina, en reemplazo de `updated_at`.
- **`local_staff`:** Vincula usuarios de `auth.users` con `locales` (`user_id`, `local_id`). **`rol` (F12, 2026-08-20):** `dueño` | `personal`, con `CHECK` y `DEFAULT 'dueño'` — ese default es lo único que impidió que los locales existentes se quedaran sin administrador al migrar. **No tiene `GRANT UPDATE (rol)` para `authenticated`**: el único camino para escribir un rol es `/api/local/equipo`. Un trigger (`local_staff_exigir_dueno`) impide dejar un local vivo con cero dueños, por UPDATE o por DELETE; deja pasar la cascada de borrar un local entero.
- **`platform_admins`:** marca qué usuarios son super-admins de la plataforma (pueden dar de alta locales vía `/api/admin/onboard`). RLS: cada quien lee solo su fila; se administra por service-role.

**Integridad:** las FK `local_id` (categorias/productos/pedidos) y `pedido_id` (pedido_items) son `NOT NULL`. Hay `CHECK` en `precio > 0`, `total > 0`, `cantidad > 0` y `precio_unitario >= 0`.

### Funciones RPC (contrato del cliente anónimo)
El cliente anónimo **no** toca las tablas directamente; opera vía funciones `SECURITY DEFINER`:
- **`crear_pedido(p_local_id, p_nombre, p_mesa, p_notas, p_items jsonb) → uuid`**: crea el pedido y sus ítems en una sola transacción, **calcula el total en el servidor** leyendo el precio real de `productos` **una sola vez** (ignora cualquier total enviado por el cliente), valida que el local esté activo y que cada producto exista y esté `disponible`. **Endurecida (T2):** topes de tamaño (cantidad ≤ 99, ≤ 50 productos, monto ≤ $10M) y `bigint` para evitar overflow. **Rate-limit configurable (F5.2):** el tope por local por minuto se lee de `locales.limite_pedidos_min` (default 40; antes era fijo en 15, que un peak legítimo reventaba). Devuelve el id del pedido.
  > **Limitación conocida:** el rate-limit protege de ráfagas accidentales, no de un atacante decidido — que igual satura y de paso deja fuera a los clientes buenos. La defensa real es un desafío/token de sesión en el checkout (Fase 8).
- **`get_order_status(p_order_id) → (estado, numero_pedido, created_at)`**: expone solo campos no sensibles del pedido cuyo UUID conoce el cliente (para el seguimiento).
- **`get_menu_publico(p_slug) → jsonb`** (F7): devuelve local + categorías + productos disponibles en **una sola consulta**, con **lista blanca** de columnas. Es lo que permitió cerrar la lectura pública de esas tablas: para ver un menú hay que saber el slug. La usa el Server Component del menú. **F10:** agrega `pedidos_habilitados` (booleano); el estado de suscripción y su motivo **no** viajan al comensal.

**Roles (F12):** `tiene_rol(local_id, roles[]) → boolean` es el helper que usan todas las guardas de rol del servidor. Es **SECURITY DEFINER** a propósito: lo llaman funciones que corren como el usuario y necesita ver la fila de `local_staff` sin depender de la RLS de esa tabla. Revocada de `PUBLIC, anon`.
- `marcar_disponibilidad(producto_id, disponible)` — **SECURITY DEFINER**, la usan dueño y personal. Existe porque la RLS **no sabe restringir columnas**: dar UPDATE sobre `productos` para marcar agotado habría dado también el precio. Es el único camino para tocar `disponible`, y lo usan tanto la comanda como el menú.
- `productos_frecuentes(local_id, limite, dias) → (producto_id, unidades)` — **SECURITY DEFINER**, dueño y personal. Alimenta la pestaña "Frecuentes" de la comanda. **No reusa `reporte_top_productos`** porque aquella devuelve `venta`, que es justo lo que le cerramos a `personal`.
- Las cinco `reporte_*` llevan la guarda de rol **dentro del cuerpo** y siguen siendo `SECURITY INVOKER`. La guarda no altera el aislamiento entre locales: quien no es del local sigue recibiendo ceros, no un error.

**Suscripción (F10):** `situacion_suscripcion(estado, hasta) → cortesia|al_dia|por_vencer|gracia|pausada` es la **fuente única de la regla**: la usan `crear_pedido` (que rechaza el pedido si está `pausada`), `get_menu_publico` y el dashboard. `estado_suscripcion(local_id)` es el envoltorio para el dueño, **SECURITY INVOKER** a propósito —igual que los `reporte_*`— para que la RLS aísle sola. Ambas revocadas de `PUBLIC, anon`.

**Actualización de pedidos:** el staff solo puede cambiar la columna `estado` (privilegios de columna), y un trigger valida las transiciones del Kanban en el servidor (`nuevo→aceptado/cancelado`, `aceptado→preparando/cancelado`, `preparando→listo/cancelado`, `listo→entregado`, y `entregado→listo` para deshacer una entrega marcada por error). Las columnas `slug`/`activo`/`limite_pedidos_min` de `locales` y el `total` de `pedidos` no son actualizables por el staff (quedan al service-role).
> **Efecto secundario de la reapertura:** el ciclo `entregado → listo → entregado` reescribe `updated_at` vía el trigger `set_updated_at`, así que esa columna **no** es una base confiable para analíticas de tiempos. La auditoría de cambios de estado que la reemplaza va en la Fase 8.

### Estructura de Carpetas Clave
- `src/app/page.tsx`: Landing comercial. Le habla al **dueño del local**, no al comensal: qué hace el sistema, cuánto cuesta y qué **no** hace. Rige la misma regla que el pitch — no se promete nada que no se pueda demostrar en vivo — así que se actualiza el mismo día que el producto gana o pierde una función. **Desde el 2026-08-26 muestra el panel además de describirlo** (ver la carpeta siguiente).
- `src/componentes/landing/` (2026-08-26): las dos maquetas del panel que la landing enseña. `demo-cocina.tsx` es espejo de `src/app/dashboard/page.tsx` y `demo-reportes.tsx` de `src/app/dashboard/reportes/page.tsx`; `marco-panel.tsx` es el marco de navegador compartido y `datos-demo.ts` los datos, inventados pero cuadrados entre sí. Son **Server Components sin estado**: la landing sigue siendo estática y no manda JavaScript. **Espejos, no capturas: si tocás una de esas dos pantallas del panel, pasá por acá antes de cerrar el commit.** `tests/landing-demo.test.ts` custodia la aritmética.
- `src/app/login/page.tsx`: Login del personal de cocina (email + contraseña).
- `src/middleware.ts`: Middleware de Next. Refresca la sesión y **redirige a `/login` si se accede a `/dashboard` sin sesión**. Solo llama a `auth.getUser()` en rutas de `/dashboard` o si hay cookies `sb-*`, para que una visita pública al menú no pague latencia de autenticación. *(Durante un tiempo se llamó `src/proxy.ts`; volvió a `middleware.ts` en la consolidación T5.)*
- `src/app/dashboard/page.tsx`: Tablero Kanban de cocina. Usa el cliente autenticado, resuelve el `local_id` del usuario vía `local_staff`, y **filtra todas las consultas y la suscripción realtime por `local_id`**. Incluye botón de cerrar sesión y muestra el nombre real del local.
- `src/app/dashboard/layout.tsx` (F12): guarda de rutas por rol. Es la **segunda** línea: quien de verdad niega los datos es la base. No bloquea el render mientras resuelve, para no agregarle un parpadeo a todo el panel.
- `src/app/dashboard/nav-panel.tsx` (F12): la navegación del panel, **una sola vez** (antes estaba copiada a mano en seis páginas). Filtra las entradas por capacidad y vive en su propia fila del header: con seis o siete destinos ya no cabe apretada al lado de las estadísticas.
- `src/app/dashboard/menu/page.tsx`: gestión self-service del menú (categorías, productos, precios, disponibilidad, fotos). **Desde F12 `personal` también entra**, pero solo al interruptor de disponibilidad: crear/editar/borrar se le ocultan y además se lo niega la RLS.
- `src/app/dashboard/comanda/page.tsx` (F12): el garzón toma el pedido. Mesa primero, grilla densa sin fotos, buscador, pestaña "Frecuentes", ficha del plato (foto e ingredientes) y **una nota por línea**. El carrito es una lista de líneas `{id, productoId, cantidad, notas}` y no `{producto: cantidad}`: el mismo producto puede ir dos veces con notas distintas.
- `src/app/dashboard/equipo/page.tsx` (F12): el dueño da de alta y de baja a su gente y les cambia el rol. Sin esta pantalla los roles existen pero hay que crear cada cuenta por SQL.
- `src/app/dashboard/config/page.tsx`: identidad visual del local (nombre, slogan, colores, logo), con validación de contraste WCAG (F9).
- `src/app/dashboard/cuenta/page.tsx`: cambio de contraseña de la **cuenta** (no del local). Exige la contraseña actual y avisa que las demás sesiones se van a cerrar.
- `src/app/dashboard/reportes/page.tsx` (F6): cierre de caja. Rangos con presets, tarjetas de venta/ticket/propinas, serie por día que pasa a **meses** sobre 62 días, top de productos, tiempos de cocina y export CSV.
- `src/app/dashboard/aviso-suscripcion.tsx` (F10): banner escalonado de vencimiento en el dashboard. **Nunca bloquea nada**: si falla la consulta, se calla.
- `src/lib/notas-rapidas.ts`: los atajos de nota de producto, compartidos por la comanda y el carrito del comensal. **Provisorios**: están pensados para sándwiches y hay que adaptarlos al primer menú real (ver el comentario del archivo).
- `src/lib/roles.ts` (F12): los dos roles, sus capacidades y qué capacidad exige cada ruta. **No es la frontera de seguridad**: decide qué se dibuja. Si agregás una capacidad acá, agregá su contraparte en el servidor.
- `src/lib/usar-rol.ts` (F12): hook que resuelve quién sos y qué rol tenés **en el local seleccionado** (el rol es por local, no por persona). Unifica el bloque de resolución de local que estaba duplicado en cuatro páginas.
- `src/app/api/local/equipo/route.ts` (F12): alta, cambio de rol y baja del personal. **Único camino** que puede escribir `local_staff.rol`, porque la columna no tiene `GRANT UPDATE` para `authenticated`. A diferencia de `/api/admin/*`, acá manda el dueño **de ese** local, no el super-admin.
- `src/app/dashboard/admin/page.tsx`: alta de locales (solo super-admin; el link se oculta a quien no lo es). Muestra las credenciales del dueño y hasta cuándo corre su prueba gratis.
- `src/app/dashboard/admin/cartera-suscripciones.tsx` (F10): cartera de suscripciones del super-admin (renovar, cortesía, cancelar).
- `src/app/api/admin/onboard/route.ts`: endpoint server-only de onboarding (usa el cliente admin / service-role).
- `src/app/api/admin/telefono/route.ts`: endpoint server-only del **derecho de supresión**. Exige número completo (no hay búsqueda parcial), borra el teléfono conservando el pedido, y deja constancia enmascarada en `supresiones_telefono`.
- `src/app/api/admin/suscripcion/route.ts` (F10): endpoint server-only de la cartera. **Único camino de escritura** de las columnas `plan`/`suscripcion_*`, que no tienen GRANT UPDATE para `authenticated`.
- `src/app/local/[slug]/`: Ruta dinámica del cliente.
  - `page.tsx` — **Server Component** (F7): trae el menú con `get_menu_publico`, expone `generateMetadata` por local, lee `?mesa=` del QR y devuelve **404 real** si el slug no existe.
  - `menu-cliente.tsx` — toda la interactividad (búsqueda, pills, carrito, reconciliación de precios).
  - `error.tsx` / `not-found.tsx` — fallo de carga (con reintento) y local inexistente.
  - `checkout-modal.tsx` (llama `crear_pedido`), `order-status.tsx` (seguimiento vía `get_order_status` + **polling cada 4s**, 15s al llegar a `listo`, hasta `entregado`/`cancelado`), `cart-sheet.tsx`, `layout.tsx` (envuelve con `CartProvider`).
- `src/lib/menu-publico.ts`: lectura del menú en el servidor, envuelta en `cache()` para que la página y `generateMetadata` compartan un solo viaje a la base.
- `src/lib/color.ts` (F9): contraste WCAG y las **cuatro** variables de marca (`--brand`, `--brand-texto`, `--accent`, `--accent-legible`). Texto sobre `var(--brand)` usa `var(--brand-texto)`, nunca blanco fijo.
- `src/lib/suscripcion.ts` (F10): `DIAS_PRUEBA` y `DIAS_GRACIA`, las dos cifras que la interfaz repite. **La regla que corta vive en Postgres** (`situacion_suscripcion`); acá solo están los números, y un test verifica que no se separen.
- `src/lib/cart-context.tsx`: Contexto del carrito, **persistido en `localStorage`** por slug.
- `src/lib/utils.ts`: helpers compartidos — `formatPrice` (pesos chilenos, sin decimales), `normalizar` (para buscar sin tildes) y `orderNumber`.
- `src/app/layout.tsx`: layout raíz — metadata base, manifiesto y `viewport`. **El `viewport` permite zoom**: fijarlo con `maximumScale`/`userScalable` dejaba fuera a quien no ve bien (WCAG 1.4.4).
- `src/lib/supabase.ts` / `src/lib/supabase/{client,server}.ts` / `src/lib/supabase/admin.ts`: clientes anónimo, autenticados y admin (ver arriba).
- `supabase/migrations/`: **migraciones versionadas (desde el 2026-08-11).** Se aplican con
  `npm run db:push`, que corre solo las pendientes y deja registro en la propia base
  (`supabase_migrations.schema_migrations`). Es la carpeta viva: toda migración nueva va acá.
- `migrations/`: **historial previo, ya aplicado a mano.** Se conserva como registro de cómo se
  llegó al esquema actual. No se re-aplica y no se agregan archivos nuevos.
- `scripts/`: utilidades de operación que corren con la service-role key (**solo local, nunca en el cliente**):
  - `limpiar-datos-test.mjs` — borra locales `test-local-*` y usuarios `@test.garzon` huérfanos. Dry-run por defecto; `--borrar` ejecuta.
  - `crear-cuenta-local.mjs <slug> <email> [password]` — crea/repara la cuenta de acceso de un local que ya existe y verifica con un login real. Para altas nuevas usar `/dashboard/admin`.
  - `respaldo-db.mjs` (`npm run db:backup`) — volcado de datos a JSON. **Se corre siempre antes de `db:push`**: el plan gratis no tiene Point-in-Time Recovery. **Pagina** (PostgREST corta en 1000 filas sin avisar), contrasta contra el conteo exacto de cada tabla y relee el archivo escrito para verificarlo.
  - `sembrar-demo.mjs` — siembra un año de pedidos verosímiles en `el-lalo` para que los reportes se puedan mostrar. Marcados con prefijo `de70de70-` en `client_request_id`; `--borrar` los quita. Dry-run por defecto y semilla fija.
  - `con-env.mjs` — pasa los secretos por variables de entorno a la CLI de Supabase, en vez de dejarlos en la línea de comando.
  - `seed-catirekaffe.js` — semilla del menú de un cliente concreto.

---

## 🔒 Seguridad y Arquitectura de Datos

El principio rector tras la auditoría: **el servidor decide, el navegador no.** Las tres decisiones sensibles (identidad, precio y qué se puede modificar) viven en Postgres, no en el cliente.

- **Autenticación de cocina:** `/dashboard` requiere sesión (Supabase Auth). Sin login, `src/middleware.ts` redirige a `/login`.
- **Aislamiento multi-tenant (RLS):** las políticas públicas de `pedidos` y `pedido_items` fueron **eliminadas**. Ahora:
  - Solo el **staff autenticado** puede leer/actualizar los pedidos **de su propio local** (RLS que verifica `auth.uid()` contra `local_staff`).
  - El **cliente anónimo** solo puede crear pedidos y consultar el estado del suyo, a través de las RPCs. No puede leer pedidos ajenos, modificarlos ni insertarlos directamente.
  - `locales`, `categorias` y `productos` **ya no tienen lectura pública (F7, hallazgo M1)**: con la
    anon key se podía enumerar la cartera completa de clientes. El menú se sirve por
    `get_menu_publico(slug)`, que exige saber el slug; el staff lee lo suyo con políticas propias.
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
- [x] **F12 — Roles y comanda:** `local_staff.rol` (`dueño`/`personal`) con el cumplimiento en la base (RLS del menú y storage, guarda dentro de las cinco RPC `reporte_*`, `marcar_disponibilidad`, trigger que impide dejar un local sin dueño); `/dashboard/equipo` para administrar la gente; `/dashboard/comanda` para tomar pedidos con nota por línea y ficha del plato; `pedidos.creado_por` por trigger.

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
| **F7 — Rendimiento percibido** | Menú a Server Component, `generateMetadata`/SEO por local, refresco de menú y reconciliación de precios del carrito. [Plan](plan/F7-RENDIMIENTO.md) | **Completa** |
| **F8 — Confianza** | Idempotencia de `crear_pedido`, auditoría de cambios de estado y tiempos reales de cocina. [Plan](plan/F8-CONFIANZA.md) · *anti-abuso: decisión pendiente del dueño* | **Completa** |
| **F9 — Marca completa** | White-label completo del flujo del cliente y validación de contraste WCAG en el editor de identidad. [Plan](plan/F9-MARCA.md) | **Completa** |
| **F10 — Negocio** | Propina sugerida + base demo de un año ([plan](plan/F10-PROPINA-Y-DEMO.md)), y suscripción por local con corte en el servidor + pitch de ventas ([plan](plan/F10-SUSCRIPCION.md)). **Pago en línea descartado**: la plata no pasa por la plataforma. | **Completa** |
| **F12 — Roles y comanda** | Roles por local (`dueño`/`personal`) con cumplimiento en la base, pantalla de equipo, y comanda del garzón (`/dashboard/comanda`). [Plan](plan/ROLES-Y-COMANDA.md) | **Completa** |
| F11 — Dominios propios | Cuando un cliente lo pida **y lo pague**. *(El dominio de la plataforma, `garzondigital.cl`, ya está: ver [`plan/DOMINIO.md`](plan/DOMINIO.md). Lo pendiente son los subdominios/dominios **por local**.)* | Pendiente |

**Dos condiciones que hay que cumplir antes de instalar el primer local, y que no
son código:**

| Qué | Cuándo | Por qué |
|---|---|---|
| **Supabase Pro** (~US$25/mes) | Antes de que un local tenga los QR pegados en sus mesas | El plan gratuito **pausa el proyecto tras varios días sin actividad**, y pausado la carta no carga. Hoy no importa porque el tráfico es nuestro; el día que dependa un cliente, sí. Decisión del dueño del 2026-08-26: no se paga todavía. |
| **Revisar `src/lib/notas-rapidas.ts`** | Al instalar el primer cliente real | Los atajos de nota son de fuente de soda de sándwiches. En un café no aplica ninguno, y ofrecer atajos que no corresponden es peor que no ofrecer ninguno. |

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
- [ ] **Imprimir comandas en térmica.** ⏸ Postergado a propósito
  ([decisión y análisis](plan/IMPRESION-COMANDAS.md)): se retoma con un cliente real y su
  impresora a la vista. El camino elegido es `window.print()` con CSS de 80mm — no CloudPRNT.
- [ ] **Atajos de nota por local.** Los de `src/lib/notas-rapidas.ts` son de
  fuente de soda y están fijos en el código. Al instalar un cliente de otro rubro
  hay que ajustarlos, o moverlos a `locales.notas_sugeridas text[]` editable desde
  `/dashboard/config`.
- [ ] Cargador masivo de fotos del menú (arrastrar N fotos, emparejado automático por nombre +
  manual, redimensionado en el navegador respetando EXIF). Acelera el onboarding de un cliente
  nuevo de horas a minutos — Catire Kaffe tiene 59 productos y 0 fotos.
- [ ] Control de stock (inventario) automático al vender productos.
- [ ] Página de información/historia del local (marca profunda, con cliente real).

---

## 📝 Historial de actualizaciones

> Bitácora de cambios. **Protocolo:** cada actualización del repositorio (commit) agrega aquí una entrada con la fecha y un resumen de lo que cambió.

### 2026-08-26 — WhatsApp en la landing y en el volante, con texto oscuro sobre el verde

`+56 9 6436 4954`. Botón en el cierre de la landing, enlace en el pie, y el
número impreso en el volante A6.

**WhatsApp va antes que el correo**, y no por costumbre: es el canal declarado en
`plan/PLAN_COMERCIAL.md`, y es el que un dueño de local contesta entre dos
servicios. El correo lo lee cuando se sienta a la computadora, si se sienta.

**El enlace lleva el mensaje prellenado.** Quien toca el botón llega al chat con
la primera frase escrita y solo aprieta enviar. Sin eso, mucha gente abre la
conversación, no sabe cómo empezar y la cierra — y esa persona ya había hecho lo
difícil, que era decidirse a escribir.

**El hallazgo que vale la pena guardar: el verde de WhatsApp cae en la misma
trampa que el naranja de la marca.** En vez de suponer, se le preguntó a
`textoSobre()` —la regla que `CLAUDE.md` manda usar— y respondió `#1c1917`. Las
cifras:

| | sobre `#25D366` | sobre `#f97316` |
|---|---|---|
| Blanco | **1,98:1** | 2,80:1 |
| `#1c1917` | 8,82:1 | 6,24:1 |

O sea que blanco sobre el verde de WhatsApp es **todavía peor** que el blanco
sobre naranja que se corrigió en la auditoría de frontend. Casi todos los sitios
lo ponen blanco. El botón de acá lleva `text-stone-900`.

**Y una excepción declarada a la regla de los iconos:**
`src/componentes/landing/icono-whatsapp.tsx` es el logotipo oficial de Simple
Icons, copiado tal cual. Heroicons no incluye marcas de terceros, y una marca
ajena no se dibuja de memoria ni se aproxima con un icono parecido.

**Verificado:** los dos enlaces con `target="_blank"` y `rel="noopener
noreferrer"`, el botón a 48 px de alto (por encima del mínimo táctil de 44), en
móvil los botones se apilan a ancho completo y el pie pasa a dos filas, sin
scroll horizontal. En el volante, el pie con el número entra dejando 4,8 mm de
holgura incluso con Arial.


### 2026-08-26 — Un volante A6 para dejar en mano, con el QR de verdad adentro

`marketing/volante-a6.html`: el primer material impreso del proyecto. Se abre en
el navegador y se imprime a escala real —105 × 148 mm declarados con `@page`—
para entregar a dueños de local después de una visita.

**Por qué en HTML y no en una herramienta de diseño.** Porque el QR tiene que ser
**el archivo real**. Un código generado por un modelo de imagen se ve idéntico a
uno bueno y no escanea, y eso no se descubre en la pantalla: se descubre cuando
ya hay cien papeles repartidos. Acá el SVG de `npm run qr` va incrustado tal cual.

**Lo que se midió, en vez de suponerlo:**

- El código imprime a **32,1 mm** de lado con **4,43 mm de zona de silencio**
  —la que trae el propio SVG—, más el blanco de la tarjeta que lo rodea.
- **Decodifica a 600, 300, 150 y 96 dpi** ya montado dentro del volante, no solo
  como archivo suelto. Se leyó con jsQR, que es un lector y no el generador.
- **Cabe en la hoja aunque Inter no cargue.** La primera versión se salía 17,8 mm
  del papel y habría cortado el pie con el correo de contacto. Corregido, y
  verificado con Segoe UI y Arial —las sustitutas del sistema, más anchas—: con
  las tres sobran 7,5 mm.

**Y ahora hay un cuarto lugar donde viven las cifras del plan**, además de la
landing, el pitch y el plan comercial. Quedó anotado en `CLAUDE.md`, con el
motivo por el que este es el peligroso: una cifra vieja en una pantalla se
corrige y ya; una cifra vieja en cien papeles repartidos, no.


### 2026-08-26 — Supabase Pro: decisión del dueño, postergada a propósito

Queda escrito para no rediscutirlo cada vez que alguien lea "plan gratis" y lo
tome por un descuido: **no se paga Supabase todavía. Es una decisión, no un
olvido.**

El riesgo real del plan gratuito es que **un proyecto se pausa tras varios días
sin actividad**, y pausado la carta del comensal no carga. Mientras el tráfico
sea nuestro —demos, pruebas, la carta de `el-lalo` que mostramos en una reunión—
eso se resuelve despausando a mano y no le arruina el día a nadie.

**El disparador para pagar no es una fecha ni el primer QR impreso: es el primer
local con los QR pegados en sus mesas.** Ahí el costo cambia de naturaleza: un
lunes tranquilo puede pausar el proyecto, y el que se entera no somos nosotros
sino un comensal que apunta el teléfono y no ve la carta, en el local de un
cliente que nos está pagando $29.900 al mes. Antes de esa instalación hay que
estar en Pro (~US$25/mes).

*(La formulación anterior en `CLAUDE.md` decía "hay que pasar a Pro antes del
primer QR real", que ya no distingue bien: el primer QR real se generó hoy y no
hay ninguna urgencia. Lo que importa es cuándo hay alguien del otro lado que
depende de que la carta cargue.)*


### 2026-08-26 — `npm run qr`: los códigos de las mesas dejan de depender de una web cualquiera

Ahora que hay dominio propio se pueden generar los QR, y se generan acá.

**Por qué un script y no una de las mil webs gratis de QR.** El QR se imprime y
se pega. Uno mal generado no falla en pantalla: falla cuando un comensal con
hambre apunta el teléfono en un local con media luz, y para entonces ya se
imprimieron cuarenta. `scripts/generar-qr.mjs` deja fijos los tres parámetros que
deciden eso:

- **SVG y no PNG.** Vectorial: la misma imagen sirve para un adhesivo de 4 cm y
  para un cartel. Un PNG se pixela al ampliarlo y el escáner falla en los bordes
  de los módulos.
- **Corrección de errores `Q` (25%).** Las webs eligen `L` por defecto porque da
  un dibujo más limpio. Pero estos códigos viven sobre una mesa de fuente de
  soda: aceite, rayones, una esquina despegada. `Q` tolera que un cuarto del
  código esté ilegible, y el costo es densidad, no tamaño de impresión.
- **Zona de silencio de 4 módulos.** El margen blanco no es estética: sin él
  muchos lectores no encuentran el código. Recortarlo "para que quepa mejor en el
  diseño" es el error más común.

`--mesas N` genera una por mesa con su `?mesa=`, que es lo que hace que el pedido
llegue a la cocina sabiendo de dónde vino. La salida va a `qr/`, que **no se
versiona**: son archivos operativos de cada cliente, no del repositorio.

**Verificado decodificando, no mirando.** El SVG se pasó por un lector real
(jsQR, que es un lector y no el mismo generador) a 1024, 300 y 160 píxeles de
lado: los tres devuelven `https://garzondigital.cl/local/el-lalo`. Generar un QR
y mirar que "se ve como un QR" no prueba nada.

Se agregó `qrcode` como **devDependency** — no viaja al navegador. Es la primera
dependencia nueva desde `@heroicons/react`, y se justifica porque esto no es un
archivo único: cada mesa de cada local va a necesitar el suyo.


### 2026-08-26 — Correo propio, y una landing que por fin se puede contestar

`contacto@garzondigital.cl` funcionando con Cloudflare Email Routing (gratis,
reenvía a la casilla personal), y **puesto en la landing**: en el cierre, debajo
del botón, y en el pie.

Lo segundo importa más de lo que parece. La página le pide a un dueño de local
que confíe **$29.900 al mes** en un sistema, y hasta hoy no le daba **ninguna**
forma de escribirnos: el pie tenía "Privacidad" y "Entrar a mi local", nada más.
Esconder el contacto es de las pocas cosas que un dueño lee como señal de que no
hay nadie al otro lado — y de paso era uno de los dos antipatrones que marcó la
revisión de UX de la landing.

El enlace del cierre va **subrayado** y no solo en otro color: el color por sí
solo no alcanza para decir "esto es un enlace" a quien no distingue bien los
tonos. El del pie no lo lleva, porque ahí está agrupado con los otros dos y la
posición ya lo dice.

**Verificado desde afuera**, que es la única forma de saber si el correo va a
llegar y no solo si el panel se puso verde: los tres `MX` de Cloudflare
publicados, el SPF (`v=spf1 include:_spf.mx.cloudflare.net ~all`) y el DKIM
presente. El detalle operativo quedó en [`plan/DOMINIO.md`](plan/DOMINIO.md) §3.3,
incluidas dos trampas: el catch-all va en `drop` y no en reenviar, y **reenviar
no es enviar** — responder *desde* esa dirección necesita un relay SMTP aparte.

**Y la documentación se puso al día con el hecho de que el producto tiene
dirección.** Tres archivos seguían diciendo que el despliegue vive en
`garzon-one.vercel.app`: `CLAUDE.md`, el pitch y —por omisión— el `README`, que
no nombraba ninguna URL. Ahora los tres apuntan a **https://garzondigital.cl**.
No es cosmético en el caso del pitch: **esa es la dirección que se le dicta a un
cliente y la que va impresa en los QR**, así que si ahí dice otra cosa, alguien
la va a dictar mal. El `README` además enlaza `plan/DOMINIO.md`, que es donde
está el porqué de cada decisión de DNS.


### 2026-08-26 — Dominio propio: `garzondigital.cl`, y el `metadataBase` que faltaba

Se compró el dominio en NIC Chile. La decisión completa —por qué ese nombre, por
qué el DNS queda en Cloudflare y no en Vercel, y el instructivo paso a paso—
vive en [`plan/DOMINIO.md`](plan/DOMINIO.md), para no volver a discutirla ni
buscar los valores en tutoriales sueltos.

**Lo que se decidió.** El DNS queda en **Cloudflare**, no en Vercel, porque Email
Routing exige ser el DNS autoritativo del dominio y tener `hola@garzondigital.cl`
importa hoy para vender. Correo y web nunca compitieron —son tipos de registro
distintos en la misma zona—, pero **solo puede haber un proveedor autoritativo**,
y esa era la única decisión real. El costo aceptado a sabiendas: **no hay
comodín**, porque un certificado `*.garzondigital.cl` exigiría los nameservers de
Vercel. Los subdominios por local (F11) se agregarán uno por uno, que para "lo
último del roadmap, cuando un cliente lo pida y lo pague" es un minuto de trabajo.
El proxy de Cloudflare va **apagado**: Vercel desaconseja un proxy inverso por
delante, y la nube naranja es la causa conocida de "Invalid Configuration".

**El cambio de código: `metadataBase`.** No existía en ninguna parte, y sin él
Next resuelve las imágenes de OpenGraph contra una ruta relativa. Una ruta
relativa no le sirve a WhatsApp: quien recibe el link no está en nuestro dominio
cuando su cliente va a buscar la miniatura. Y **WhatsApp es el canal de venta
declarado** en `plan/PLAN_COMERCIAL.md` — `src/app/opengraph-image.tsx` se
escribió justamente para que el link no llegara como una línea de texto gris, y
le faltaba la pieza que la vuelve absoluta. Ahora sale de `NEXT_PUBLIC_SITE_URL`,
con dos escalones de respaldo: la URL que Vercel inyecta en las vistas previa
—así una preview no anuncia imágenes del dominio de producción— y localhost.

**Ojo al desplegar:** hay que definir `NEXT_PUBLIC_SITE_URL` en el entorno de
producción de Vercel. Si no, el respaldo la deja apuntando a la URL de la preview.

**Lo que queda por hacer y no es de código:** delegar los nameservers en NIC,
agregar los dos dominios en Vercel, activar Email Routing, y la Site URL de
Supabase (riesgo bajo: se verificó que el proyecto no usa `emailRedirectTo` ni
enlaces mágicos en ninguna parte). **Los QR se generan recién ahora**, con el
dominio definitivo: no hay ninguno impreso todavía y ese es el orden correcto.

**Anotado en `plan/DOMINIO.md` §4 y no es burocracia:** la renovación anual deja
de ser un trámite cuando los QR están impresos y pegados en las mesas de los
clientes. Si el dominio vence no se cae un sitio — se caen todos los QR de todos
los locales, y eso se arregla reimprimiendo, local por local.


### 2026-08-26 — Rediseño de la landing: la página deja de contar el producto y lo muestra

La landing respondía bien las tres preguntas del dueño —qué hace, cuánto cuesta,
qué no hace— pero las respondía **solo con texto**: ocho títulos en negrita y una
lista de lo incluido. El dueño que llegaba a la página no veía nunca el producto.
El único botón que mostraba algo llevaba a la carta demo, que es la pantalla del
**comensal**, no la suya. Le faltaba justamente lo que compra.

**Dos pantallas del panel, dentro de la página.** Bajo el hero está ahora el
tablero de la cocina, con sus cuatro columnas, el cronómetro que se pone ámbar a
los ocho minutos y las notas del cliente en amarillo. Más abajo, en su propia
sección, la página de reportes completa: venta total, desglose, tiempos de
cocina, el gráfico de los veintiséis días del mes y la tabla de productos.

**Son réplicas en HTML, no capturas.** Se evaluaron las dos opciones. Un PNG pesa,
se ve borroso al hacer zoom, hay que rehacerlo a mano cada vez que el panel
cambia y obliga a entrar al panel con credenciales para tomarlo. La réplica queda
nítida en cualquier pantalla, no suma un solo kilobyte —la landing sigue siendo
estática y sin JavaScript, se ve en el `○ /` del build— y se adapta al ancho del
teléfono. El precio que sí tiene es el desfase: si el panel cambia, la maqueta
miente. Por eso cada componente nombra en su cabecera el archivo del que es
espejo y quedó anotado arriba, en el sistema de diseño.

**Los datos son inventados y lo dice la página.** Un rótulo "Datos de
demostración" en el marco de cada maqueta. Y son inventados pero cuadran, porque
un dueño de local mira una página así y suma: la venta total es exactamente la
suma de las barras, el ticket promedio sale de dividir por los pedidos **no**
rechazados, entregado más pendiente da el total, y el total de cada pedido del
tablero es la suma de sus líneas. `tests/landing-demo.test.ts` (9 pruebas puras,
sin base) falla si alguien retoca un número y deja de cuadrar. Una de esas
pruebas custodia la regla de negocio: **la propina no entra en la venta**.

**Lo que las maquetas hacen distinto del panel, a propósito.** Nada adentro es
interactivo: en el panel real cada barra del gráfico y cada acción de una tarjeta
son un `<button>`, y copiarlos habría sumado unas cuarenta paradas de tabulador
que no llevan a ningún lado. Cada maqueta va en un `<figure>` con el bloque
visual en `aria-hidden` y un `<figcaption>` que la describe en una frase: quien
usa lector de pantalla no tiene por qué escuchar una tabla de seis productos que
no existen. El pie de la de reportes va en `sr-only` —se decidió no mostrarlo—,
pero **sigue existiendo**: borrarlo dejaría esa maqueta sin nada que anunciar,
porque el marco entero está oculto para la accesibilidad. El cronómetro no corre y el punto de "En vivo" no parpadea. Y el pie
de la tarjeta del tablero usa `flex-wrap`, porque el total más los dos botones
piden 259 px y una columna da 189 px cuando las cuatro entran en el ancho de la
landing; el original se sale y lo tapa su `overflow-x-auto`.

**El resto de la página.** Las ocho funciones llevan ahora un icono de Heroicons
cada una —ocho títulos en negrita seguidos son un muro y el ojo no encuentra
dónde empezar—. El contenedor pasó de `max-w-5xl` a `max-w-6xl` en todas las
secciones, que es el ancho que necesitaba la maqueta de reportes, y las franjas
claras se reordenaron para que sigan alternando. Se conservaron el copy, el
precio, la sección "Lo que todavía no hace" y la regla de un solo `btn-primario`
en toda la página: sigue siendo el del hero.

**Verificado en local:** sin scroll horizontal a 375, 768, 1024 y 1440 px; cero
elementos enfocables dentro de las maquetas; `dash-text-muted` a 5,85:1 y
`dash-text-secondary` a 6,01:1 sobre sus fondos; la ruta del marco subió a
`text-stone-400` porque el 500 caía a 3,63:1; sin errores de consola ni avisos de
hidratación; `npm run build` deja `/` estática.

*(Hallazgo anotado y no corregido, porque es del panel y no de la landing: el
"Rechazar" de la tarjeta del tablero usa `text-red-400/70` sobre `#1c1917`, que da
3,55:1 y no llega a AA. La maqueta lo replica tal cual. Corregirlo es tocar
`/dashboard`.)*


### 2026-08-24 — Auditoría de frontend, cierre: iconos, esqueletos y las últimas retículas

Los nueve hallazgos que habían quedado fuera del plan de seis puntos. Con esto la
auditoría queda cerrada: **26 de 26**.

**Un solo sistema de iconos (A-12).** Convivían dos: trazados de Heroicons
copiados a mano en `<svg>` —con `strokeWidth` alternando 2 y 2.5 sin criterio— y
emoji haciendo de interfaz. El emoji lo dibuja el sistema operativo, así que el
🔥 de Android no es el que se probó en el iPhone; además no se puede teñir y no
acompaña al tamaño del texto. Ahora hay una dependencia, `@heroicons/react`.

La distinción que importa y que quedó escrita en `CLAUDE.md`: **el emoji que el
dueño elige para sus categorías es contenido del cliente**, se guarda en
`categorias.icono`, se edita en `/dashboard/menu` y viaja por `get_menu_publico`.
No se toca. Solo se reemplazó lo que estaba fijo en el JSX como decoración.

**El logo por defecto (A-17).** Un local sin logo se veía con el emoji de
hamburguesa. El único cliente cargado hoy es un café. Ahora es la inicial del
local sobre `var(--brand)`, con `var(--brand-texto)` encima — neutro respecto del
rubro y calculado por contraste. De paso, los dos headers del panel dejaron de
usar 🍔 como marca del producto: usan el mismo archivo que el favicon.

**Tipografía y navegación (A-16, A-20).** Inter dejó de pedirse con un `@import`
de Google Fonts, que encadenaba dos descargas antes de poder pintar y no ajustaba
las métricas del sustituto; la carga `next/font/google`, autoalojada. Y hay
enlace de "saltar al contenido": la cabecera de la carta tiene logo, buscador y
una fila de píldoras de categoría, así que con doce categorías eran doce paradas
de teclado antes del primer producto, en cada carga.

**Pantallas que faltaban (A-15).** `app/not-found.tsx` y `app/error.tsx`. Había
versiones para la carta del comensal, pero cualquier ruta fuera de `/local/` caía
en la pantalla por defecto de Next, en inglés.

**Esqueleto en reportes (A-19).** Esa pantalla tiene una estructura conocida de
antemano, así que se dibuja antes de tener los datos y el contenido no salta al
llegar. El aro girando se quedó donde la estructura **no** se conoce (mientras se
resuelve qué local es), que es donde sí corresponde.

**Retículas (A-23).** En reportes, las tres cifras dejaron de ser tres columnas
idénticas: la venta total ocupa dos tercios y lleva la cifra grande, porque es el
número por el que el dueño abre la pantalla. En la landing, los cuatro pasos de
"Cómo funciona" dejaron de ser cuatro tarjetas iguales y pasaron a ser un hilo
numerado — el contenido *es* una secuencia, y ahora se lee como tal.

**Y dos restos del defecto de contraste original**, que el barrido anterior no
alcanzó porque no llevaban el gradiente de marca:

- El botón "Reintentar" de la carta (`bg-orange-500` + `text-white`, 2,80:1) y la
  clase muerta `.category-active`, que no usaba nadie y arrastraba `color: white`
  sobre el color del local.
- **Las columnas del Kanban.** Los contadores y los botones de avance llevaban
  `text-white` sobre los gradientes de columna, y en siete de los ocho tonos eso
  no llegaba a AA: 2,15:1 sobre `amber-500`, 2,28:1 sobre `green-500`, 2,80:1
  sobre `orange-500`. El color del texto pasó a vivir junto al del fondo. El azul
  era el único donde ninguna de las dos opciones cruzaba el umbral en los dos
  extremos, así que se oscureció un escalón (`blue-600→700`): es un cambio de
  tono, no de significado.

También se corrigió que la barra de estadísticas móvil mostrara la venta del día
sin la guarda `ver_reportes` que sí tenía su copia del header. Sigue siendo
cosmético —el personal lee `pedidos.total` porque lo necesita para trabajar—,
pero que las dos copias del mismo bloque digan cosas distintas es cómo se pierde
una regla.

### 2026-08-24 — Auditoría de frontend: contraste, diálogos, identidad y escala

Una revisión completa del frontend —8.777 líneas, 25 archivos `.tsx`— encontró 26
hallazgos. Se aplicaron los seis puntos del plan, en cuatro commits.

**El hallazgo que ordena a los demás.** El proyecto tenía desde F9 una biblioteca
de contraste WCAG (`src/lib/color.ts`) que garantiza que el texto se lea sobre el
color que elija cada local. El naranja de la plataforma nunca pasaba por ella:
los botones primarios llevaban `text-white`, que sobre `#f97316` da **2,80:1** y
sobre `#f59e0b` **2,15:1**, cuando el AA de la WCAG pide 4,5:1. Alimentada con
esos mismos dos colores, `textoSobre()` devuelve `#1c1917`. Es decir: si un local
hubiera elegido exactamente ese naranja como su marca, la carta le habría dado
texto oscuro automáticamente; la plataforma se daba a sí misma texto blanco.

De la misma familia: `text-stone-400` (2,52:1) era el color de la descripción de
los productos y de la dirección del local, a 11px, en un teléfono; los
placeholders estaban en `text-stone-300` (1,49:1); y la píldora de categoría
activa era el único punto de la carta que ponía `color: "white"` sobre
`var(--brand)`, contra la regla explícita del white-label. Todo eso se corrigió.

**Dos incumplimientos más aparecieron midiendo la página corriendo y no leyendo
el código**, porque no eran grises: los numeritos de "Cómo funciona"
(`orange-600` sobre `orange-50`, 3,35:1) y el párrafo del plan sobre la tarjeta
oscura (4,12:1). Vale la pena recordarlo: el grep encuentra lo que sabés buscar.

**Accesibilidad.** Los cuatro modales del producto eran un `div` con
`fixed inset-0`: sin rol, sin foco atrapado, sin Escape, y al cerrarlos el foco se
perdía. Ahora los ocho pasan por `src/componentes/modal.tsx`. Los seis
`window.confirm()` pasaron a `src/componentes/usar-confirmar.tsx`, que es lo que
por fin permite que **agotar se vea rojo** —la regla estaba escrita hacía meses y
el cuadro del navegador la hacía imposible—. Las 39 etiquetas de formulario
quedaron todas asociadas a su campo (había 8 de 41). Y se pasó de **cero a 30
regiones vivas**: la que más pesa es la de la cocina, donde el tablero se
actualiza solo al entrar un pedido y eso no se anunciaba de ninguna forma.

El gráfico de ventas mostraba sus valores solo con `group-hover` y un `title`, o
sea que en la tablet táctil —donde vive el panel— no tenía un solo número
legible. Cada barra es ahora un botón: tocarla la fija y su dato sale en el
encabezado.

**Identidad.** El favicon era el de `create-next-app`, sin tocar desde el día que
se creó el proyecto; con él se fueron los cinco SVG del andamio. El manifiesto
declaraba dos iconos que no existían desde siempre, así que la instalación como
app nunca había funcionado. Y la landing no tenía `og:image` pese a que el canal
de venta declarado es WhatsApp, donde un link sin imagen llega como una línea de
texto gris. Los tres iconos salen de `npm run iconos`; las dos imágenes de
compartir se componen con `ImageResponse`, y la del local usa `variablesDeMarca()`
para elegir su texto por contraste. **El dibujo de la marca es provisorio y está
marcado como tal**: la identidad visual es decisión del dueño.

**Escala tipográfica.** Convivían 198 tamaños arbitrarios en 12 valores —tres de
medio píxel— con 398 de la escala de Tailwind: veintiún tamaños en circulación.
Ahora hay una escala y una regla de piso por pantalla, y los campos de formulario
van en 16px para que Safari de iOS no haga zoom al enfocarlos. El gradiente
naranja dejó de ser el único recurso de énfasis: tres niveles de botón, uno solo
primario por pantalla.

**Un bug de theming que llevaba desde F9 y salió midiendo la pantalla.** La carta
no escribe los precios sobre blanco puro: los escribe sobre superficies teñidas
con la marca del local —`color-mix(in srgb, var(--brand) 12%, white)` en el
resumen del checkout, 10% en el control de cantidad—. Pero `--accent-legible` se
calculaba contra **blanco**, y un fondo teñido es más oscuro: el número del
control de cantidad daba **4,17:1**. Ahora `variablesDeMarca()` mide contra el
tinte real y hay un test que barre marcas y acentos exigiendo AA sobre él. Es el
tipo de defecto que no aparece leyendo el código —las dos piezas son correctas
por separado— sino abriendo la pantalla con algo en el carrito.

**Un hallazgo que no era de diseño.** `vitest` descubría los tests dos veces —los
propios y los del worktree de git que vive dentro del repo— y corría la suite
duplicada contra la misma base, hasta que Supabase cortaba por límite de tasa.
Fallaban cinco pruebas de aislamiento que no tenían nada roto, con un síntoma que
engañaba. Se agregó el `exclude` correspondiente.

Las reglas que quedan vigentes están en `CLAUDE.md` y comentadas en
`src/app/globals.css`. **Lo que sigue pendiente de la auditoría** son los
hallazgos medios y bajos que no entraron en el plan: los dos sistemas de iconos
conviviendo (SVG a mano y emoji), la falta de un 404 propio, Inter cargado por
`@import` en vez de `next/font`, el emoji 🍔 como logo por defecto de cualquier
local, los esqueletos de carga y el enlace para saltar al contenido.

### 2026-08-20 — Atajos de nota, compartidos con la carta pública

Los seis atajos (*sin mayo, sin ají, sin tomate, sin cebolla, sin palta, extra
queso*) salieron de la comanda a `src/lib/notas-rapidas.ts` y ahora los usan las
**dos** pantallas donde alguien escribe una nota de producto: la comanda del
garzón y el carrito del comensal. Estaban duplicados un solo día y ya era el
momento de no duplicarlos, porque justamente lo que se sabe de ellos es que van a
cambiar.

**Están marcados como provisorios dentro del archivo.** La lista sirve para una
fuente de soda de sándwiches; en un local de café y pasteles no aplica ninguno, y
ofrecer atajos que no corresponden es peor que no ofrecer ninguno. El comentario
deja planteadas las dos salidas: ajustarlos a mano si todos los clientes se
parecen, o moverlos a una columna `locales.notas_sugeridas text[]` editable desde
`/dashboard/config`, que es lo correcto en cuanto haya dos rubros distintos. No
se hizo lo segundo todavía a propósito: es una columna, una migración y una
pantalla para un problema que aún no sufre nadie.

`agregarNotaRapida(actual, atajo)` **no repite**: con el teléfono en la mano es
fácil tocar dos veces el mismo atajo, y "sin mayo, sin mayo" llegaría así a la
cocina. La comparación ignora mayúsculas y espacios sobrantes.

En la carta pública los chips van en **gris y no en el color del local**: son
ayudas de escritura, no llamadas a la acción, y no deben competir con el botón de
confirmar el pedido.

**Verificación.** 6 tests unitarios nuevos (**175 en total**), incluido uno que
comprueba que encadenar los seis atajos no se pasa del tope de 300 caracteres que
exige `crear_pedido`. Se confirmó además que los atajos y la función llegan al
**bundle real que se le sirve al comensal** en `/local/[slug]`. *No* se vieron
dibujados: el panel del navegador perdió el contexto de ejecución entre llamadas,
como viene pasando toda la sesión.

### 2026-08-20 — Comanda: agotar se confirma, y la nota se pone antes de agregar

Dos correcciones más, otra vez salidas de usar la pantalla con un perfil de
staff real.

**Agotar ahora se confirma.** El icono era gris y pasaba desapercibido; encima
disparaba al primer toque. Ahora es **rojo** (texto, fondo y borde) y abre un
diálogo: *"¿Agotar Italiano? Deja de aparecer en la carta del cliente al
instante."* Es la única acción de esta pantalla que sale del panel y llega al
comensal, así que no puede pasar por un toque distraído mientras se marca un
pedido.

**La nota se pone ANTES de agregar.** Era el defecto de fondo: la nota solo
existía en el panel de revisión del final, así que con cinco personas en la mesa
y tres pidiendo cambios había que elegir entre acordarse de todo hasta el final o
ir y volver de pantalla por cada uno. Las dos cosas son exactamente lo que esta
pantalla existe para evitar.

Cada tarjeta tiene un botón **"📝 Con nota"** que abre un diálogo con el texto,
una cantidad y seis atajos (*sin mayo, sin ají, sin tomate, sin cebolla, sin
palta, extra queso*). Al aceptar entra como **línea nueva**, aunque el producto
ya esté en el pedido: si se fusionara con la línea sin nota, la nota de uno se le
aplicaría a los dos. Con el texto vacío simplemente suma, para no dejar líneas
sueltas que después haya que juntar a mano.

Los atajos son **genéricos y están fijos en el código**: una lista por local
necesitaría una columna nueva y todavía no hay quien la pida.

**Verificación de layout.** Otra vez con una ruta pública temporal, ya borrada.
A 375 px: sin desborde, tarjetas de 171×146-158 y el diálogo en 375×229, que
entra de sobra en pantalla. A 1024 px: cuatro columnas, las cuatro tarjetas de la
misma altura, sin desborde. Y se comprobó por CSS computado que el botón de
agotar quedó efectivamente en rojo. 169 tests, `tsc`, `eslint` y `build` limpios.

**Lo que no se verificó:** sigue sin mirarse renderizado el flujo real dentro del
panel, porque pide autenticarse.

### 2026-08-20 — La comanda, usable: stock reversible, ficha del plato y nota por línea

Tres defectos de la primera versión, los tres encontrados usándola.

**1. Agotar era una puerta de una sola dirección.** La comanda filtraba el
producto al marcarlo agotado, así que desaparecía de la grilla: un toque sin
querer lo sacaba de la carta pública y desde esa pantalla no había cómo
devolverlo. Ahora la tarjeta se queda en su lugar, atenuada y tachada, con un
botón "Agotado · volver a poner". Y el control de agotar salió de debajo del
precio —donde estaba justo en el recorrido del dedo que va a sumar— a un icono
chico en la esquina.

**2. `personal` no tenía dónde reponer fuera del pedido.** La pestaña Menú pasó
a exigir `marcar_agotado` en vez de `editar_menu`, así que `personal` entra, ve
el menú completo y usa el interruptor de disponibilidad. Los botones de crear,
editar y borrar se le ocultan — pero eso es cortesía, no seguridad: **la RLS ya
le niega esas tres operaciones**, así que un botón que se escapara solo
conseguiría un error, nunca un cambio. La página lleva un aviso explicando qué
puede hacer.

*Nota:* que agotar llegue a la carta del comensal **ya funcionaba** desde F7 —
`get_menu_publico` filtra `disponible = true`. No hubo que construirlo; ahora
hay un test que lo fija.

**3. La nota era del pedido, no del ítem.** Faltaba lo que la carta pública ya
hacía (`checkout-modal.tsx` manda `notas` por ítem desde siempre): "chacarero
sin ají, italiano sin mayo", cada uno en su línea. El carrito de la comanda era
`Record<productoId, cantidad>` y no podía expresarlo.

Ahora es una lista de **líneas** — `{id, productoId, cantidad, notas}` — así que
el mismo producto puede ir dos veces con notas distintas ("dos italianos, uno
sin mayo"). `pedido_items` **no tiene índice único por (pedido_id, producto_id)**,
así que la base lo aguantaba sin cambios, y la cocina ya renderiza `item.notas`
por línea. Hay un panel "revisar" donde cada línea tiene su nota, un botón
**Separar uno** para partir una línea de dos en dos líneas, y abajo la nota
general del pedido, que se conserva.

**4. Ficha del producto.** Un botón ⓘ en la tarjeta abre foto, precio e
ingredientes, para mostrarle el plato al comensal o leerle qué lleva sin salir
de la comanda. Solo aparece si el producto tiene foto o descripción; si no tiene
ninguna, la ficha lo dice y aclara que las carga el dueño.

**De paso:** la pestaña activa de la comanda pasó de corregirse en un `useEffect`
a ser un valor derivado (`useMemo`). El `react-hooks/set-state-in-effect` de este
proyecto es un error, no una advertencia, y además así no hay un primer render
con la pestaña equivocada.

**Verificación.** 4 tests nuevos contra Supabase real (**169 en total**): que
`personal` puede reponer lo que agotó, que agotar saca el producto de
`get_menu_publico` y reponerlo lo devuelve, que dos líneas del mismo producto
llegan con su propia nota cada una, y que la nota no altera el total (que lo
sigue calculando el servidor). `tsc`, `eslint` y `build` limpios.

### 2026-08-20 — Arreglo: el header del panel desbordaba a lo ancho

**El síntoma.** En un notebook, el panel quedaba con scroll horizontal: el header
empujaba el ancho del `body` y arrastraba el Kanban entero. Los iconos de la
derecha quedaban fuera de pantalla.

**La causa, medida y no supuesta.** La nav pasó de 4 entradas a 6 (7 para el
super-admin) y encima le sumé el botón "+ Tomar pedido", en una fila que no tenía
`flex-wrap` ni nada que cediera. Con una ruta pública temporal que reproducía el
header en su peor caso: la **nav sola medía 554 px**, y la fila completa pedía
~1.450 px contra los 976 útiles de una pantalla de 1024.

**El arreglo.** Con seis o siete destinos la nav dejó de ser "unas pestañas al
lado de las estadísticas" y pasó a ser una barra de navegación: ahora va en su
**propia fila** dentro del header. Además: `flex-wrap` en ambas filas para que
degrade en vez de desbordar, `min-w-0` + `truncate` en el nombre del local,
`overflow-x-auto` en la nav (que se desplaza sola en vez de estirar la página),
espacios más chicos, y las estadísticas y el estado de conexión aparecen recién
en `lg` en vez de `sm`, donde no cabían. La etiqueta "Tomar pedido" quedó como
"Comanda".

**Medido después del cambio** (misma ruta temporal, ya borrada):

| Ancho | Antes | Después |
|---|---|---|
| 1024 | desborda; header de 176 px | sin desborde; header de 118 px, fila 1 en una sola línea |
| 1280 | — | sin desborde; header de 118 px |
| 375 | — | sin desborde; la nav se desplaza dentro de sí misma |

**Efecto secundario bueno:** en celular antes **no había navegación** (era
`hidden md:flex`). Ahora la nav se ve y se desplaza, que es justamente lo que
necesita un garzón con el teléfono en la mano.

### 2026-08-20 — F12: roles por local y comanda del garzón

**El problema.** Una fila en `local_staff` equivalía a ser dueño: las trece políticas RLS del
proyecto usaban el mismo predicado, así que quien entraba al panel podía cambiar precios, borrar
categorías, borrar las fotos y ver la caja del día. Para vender a un local con empleados eso era un
bloqueador: nadie le entrega a un garzón de temporada las llaves de su negocio.

**Dos roles, no tres.** Decisión del dueño: `dueño` y `personal`. En una fuente de soda la misma
persona toma el pedido y lo cocina; separar "garzón" de "cocina" habría sido burocracia sin uso.
`personal` tiene el Kanban completo —incluido **cancelar y reabrir**, por decisión explícita— más la
comanda y marcar agotado. No ve reportes, ni precios, ni identidad del local, ni el equipo.

**Dónde se hace cumplir cada regla** (esconder un link en React no es un permiso):

| Regla | Capa |
|---|---|
| Menú, precios, fotos, identidad | Las 10 políticas RLS + las 3 de `storage.objects` |
| Reportes | Guarda de rol **dentro** de las cinco RPC `reporte_*` |
| Marcar agotado | RPC `marcar_disponibilidad()` |
| Escribir un rol | Solo `/api/local/equipo` (sin `GRANT UPDATE (rol)`) |
| Que quede un dueño | Trigger `local_staff_exigir_dueno` |
| Qué pantallas se ven | React — **solo cosmético** |

**Los reportes no se pueden cerrar con RLS**, y esto es lo menos obvio del cambio: leen `pedidos`, y
la cocina también lee `pedidos`. Son las mismas filas. La salida obvia —pasarlas a `SECURITY
DEFINER`— está prohibida en `CLAUDE.md` y hay un test que se pone rojo. Se resolvió dejándolas
`INVOKER` y metiendo la guarda en el cuerpo: `prosecdef` no cambia, el test sigue verde, y la guarda
está escrita para **no** alterar el aislamiento entre locales (quien no es del local sigue recibiendo
ceros, no un error).

**Dos errores propios que vale la pena dejar anotados:**
1. Saqué los cuerpos de `reporte_*` de la migración F6 en vez de la base viva. F10 ya las había
   redefinido: `reporte_ventas` tenía `propinas_total`, y existían dos funciones más que no estaban
   en mi lista (`reporte_ventas_por_mes` y `reporte_tiempos`). El push falló con 42P13 y hubo que
   sacar las definiciones reales con `pg_get_functiondef`. **Son cinco, no tres.**
2. La primera versión dejaba el invariante "siempre un dueño" solo en el endpoint. Un `UPDATE` por
   SQL lo habría saltado, dejando un local que solo se arregla a mano sobre la cuenta de un cliente.

**La comanda (`/dashboard/comanda`).** Pantalla propia, no la carta pública con otra piel: la carta
está hecha para un comensal eligiendo con calma y acá hay que marcar doce ítems en cuarenta
segundos. Mesa primero, grilla densa sin fotos, pestañas por categoría, buscador, y una pestaña
**"Frecuentes"** alimentada por `productos_frecuentes` — una RPC **nueva**, que no reusa
`reporte_top_productos` porque aquella devuelve `venta`, justo lo que le estamos cerrando a
`personal`. El `client_request_id` se genera antes de enviar y se reusa al reintentar; no se pide
teléfono. Ida y vuelta al Kanban en un toque, también en móvil.

**`pedidos.creado_por`** se llena por trigger y no dentro de `crear_pedido`: reproducir 150 líneas de
una función que ya va en su v9 es la forma clásica de que se desvíe del original sin que nadie lo
note.

**De paso:** se eliminó la navegación del panel duplicada a mano en seis páginas (`nav-panel.tsx`) y
se agregó `dashboard/layout.tsx` con la guarda de rutas.

**Verificación.** 29 tests nuevos contra Supabase real (**165 en total**), que comprueban el efecto y
no el mensaje: una cuenta `personal` de verdad llamando la API directo. `tsc`, `eslint` y `build`
limpios. **Lo que NO se verificó:** las pantallas nuevas no se miraron renderizadas —hacerlo pedía
autenticarse en el navegador— así que la comanda y la pantalla de equipo están probadas por su
lógica y su contrato con la base, no por uso real.

**Archivos:** `supabase/migrations/20260820120000_f12_roles_local.sql`,
`supabase/migrations/20260820150000_f12_ultimo_dueno.sql`, `src/lib/roles.ts`, `src/lib/usar-rol.ts`,
`src/app/dashboard/{layout,nav-panel}.tsx`, `src/app/dashboard/{comanda,equipo}/page.tsx`,
`src/app/api/local/equipo/route.ts`, `tests/roles.test.ts`, `plan/ROLES-Y-COMANDA.md`.

### 2026-08-19 — Cambiar la contraseña desde el panel (`/dashboard/cuenta`)

Cerraba un agujero de coherencia: la tarjeta de alta de locales le dice al dueño *"debe cambiar la
contraseña en su primer ingreso"* y **no existía ninguna pantalla donde hacerlo**. Ni cambio, ni
recuperación: solo el login. La instrucción era imposible de cumplir.

- **`/dashboard/cuenta`**, enlazada con un 🔑 al lado de cerrar sesión en las cinco pantallas del
  dashboard. Vive aparte de `/dashboard/config` porque la contraseña es de la **persona**, no del
  local: quien atiende dos locales tiene una sola.
- **Exige la contraseña actual**, que Supabase por sí solo no pide. Sin eso, una tablet desbloqueada
  sobre el mesón alcanza para que cualquiera cambie la clave y deje al dueño fuera. La verificación
  se hace en un cliente **desechable**, así un intento fallido no toca la sesión abierta.
- **Mínimo 10 caracteres** (el de Supabase es 6), campo de confirmación y "ver lo que escribo".
- **Dos bugs que encontró la verificación contra Supabase real**, ninguno visible en el código:
  1. `signOut()` de Supabase es **global**: revoca todas las sesiones del usuario. Al verificar la
     contraseña actual y cerrar el cliente desechable, se llevaba puesta la sesión de quien la
     estaba cambiando y la de todas las tablets. Corregido con `scope: "local"`.
  2. **`updateUser({password})` sí cierra las demás sesiones**, y un comentario mío afirmaba lo
     contrario. Es correcto en seguridad y no se puede evitar desde el cliente, así que la pantalla
     ahora lo **avisa antes** de cambiarla ("si estás en pleno servicio, mejor hazlo después") y lo
     repite al terminar. Una tablet que se desloguea sola a mitad de turno, sin explicación, se lee
     como que el sistema se cayó.
- **`tests/cuenta.test.ts`** (4 tests) reproduce el flujo completo contra Supabase con una cuenta
  desechable, incluido un test que existe solo para atrapar la reaparición del `signOut` global.
- `npm test` **136/136**, `tsc`, `eslint` y `build` limpios.

**Pendiente relacionado:** no hay "olvidé mi contraseña" en el login. Necesita correo, y el SMTP
compartido del plan gratis de Supabase no es confiable para producción.

### 2026-08-19 — Supresión de datos por teléfono (panel de super-admin)

La herramienta para responder cuando un comensal pide que borren su teléfono. Cierra T8 de
[`plan/TELEFONO-COMENSAL.md`](plan/TELEFONO-COMENSAL.md).

- **`/api/admin/telefono`** (server-only, super-admin): `GET` consulta y `POST` borra. Verificado que
  sin sesión devuelve **401 antes de mirar el número**, así que ni siquiera filtra si un teléfono es
  válido.
- **No es un buscador de clientes, y el diseño lo impide.** Solo acepta el número **completo y
  válido** —sin búsqueda parcial no hay directorio que recorrer—, no devuelve el contenido de los
  pedidos ni el nombre de quien los hizo, y solo lo puede usar el super-admin. Este documento y el
  plan decían que un buscador por teléfono para el *staff* sería perfilamiento; sigue siendo cierto
  y por eso el staff no lo tiene.
- **Borra el teléfono, no el pedido.** La venta es la contabilidad del local y no le pertenece a
  quien pide la supresión.
- **`supresiones_telefono`**: constancia de cada supresión con el teléfono **enmascarado**
  (`+56 9 ---- 5678`), cuántos pedidos alcanzó, quién y cuándo. Guardarlo entero "para saber a quién
  le borramos" habría anulado el borrado, mudando el dato de tabla. Un `CHECK` rechaza cualquier
  texto con **5 dígitos seguidos**, así que la regla se cumple aunque la aplicación se equivoque —
  hay un test que lo comprueba insertando un número completo y esperando el rechazo.
- La tabla tiene **RLS activada y CERO políticas**: ni el anónimo ni una sesión de staff la leen o
  escriben. Solo el service-role, que la salta.
- El borrado se ofrece **por local** (lo normal: el responsable es el local que recibió el reclamo) y
  globalmente como excepción explícita.
- `npm test` **132/132** (126 + 6 nuevos), `tsc`, `eslint` y `build` limpios.

### 2026-08-19 — Teléfono del comensal (pedidos de retiro)

La cocina ya puede contactar a quien viene a retirar. Plan completo, con el análisis legal, en
[`plan/TELEFONO-COMENSAL.md`](plan/TELEFONO-COMENSAL.md).

**Lo que este cambio significa:** hasta hoy la base guardaba un nombre de pila y una mesa, que no
identifican a nadie. Un teléfono sí. Garzón Digital pasa a tratar **datos personales de terceros**,
y todo el diseño sale de ahí — no de la comodidad de tener un campo más.

- **Migración `20260819170000`**: `pedidos.telefono` (E.164, con CHECK `^\+569[0-9]{8}$`) y
  `pedidos.tipo_entrega` (`mesa|retiro`). Ninguna de las dos tiene `GRANT UPDATE` para el staff: se
  escriben solo desde `crear_pedido`. El staff **sí** las lee, que es el punto.
- **`tipo_entrega` es un campo real** y no el texto libre de `mesa`. Colgar una regla de negocio de
  una cadena de texto era frágil, y de paso la cocina puede agrupar los retiros.
- **`crear_pedido` v9**: normaliza el teléfono en el servidor (tolera `+56`, el `0` de discado,
  espacios y guiones) y lo guarda siempre en E.164. Un número ilegible **no tumba el pedido**: se
  guarda `NULL`. Perder una venta real por un tipeo es peor que no poder llamar.
- **`src/lib/telefono.ts`**: normalización y formateo puros, con 23 tests unitarios. El campo del
  checkout muestra el `+56` impreso al costado y el comensal escribe 9 dígitos.
- **Cocina**: insignia de retiro y botón "Contactar" que revela el número **solo a pedido** —la
  pantalla de cocina está a la vista del público todo el turno— con `tel:` y `wa.me`. El enlace de
  WhatsApp abre el WhatsApp **del propio local** con el mensaje escrito y una persona aprieta enviar:
  sin proveedor de mensajería, sin sub-encargado nuevo y sin costo por mensaje.
- **Borrado automático a los 7 días** (`borrar_telefonos_antiguos`, agendada con `pg_cron`). Se borra
  por **edad y no por estado**: la versión que solo tocaba pedidos entregados dejaba vivos para
  siempre los teléfonos de pedidos abandonados en `nuevo` o `preparando`.
- **`pg_cron` no estaba habilitado** en el proyecto: la primera migración creó la función e intentó
  agendarla, el intento cayó en su manejador de excepciones y **la función quedó existiendo sin que
  nadie la llamara**. La promesa de "se borra a los 7 días" habría sido falsa mientras la política de
  privacidad la afirmaba. Lo arregla la migración `20260819172000`; verificado contra `cron.job`.
- **`/privacidad`** (borrador, pendiente de abogado): quién es responsable y quién encargado, qué se
  guarda, por cuánto, y que los datos están en **us-east-2 (Ohio, EE.UU.)** — dicho explícitamente,
  porque ocultar una transferencia internacional es el error caro. Enlazada desde el checkout y la
  landing. Tiene 4 marcadores `[CONTACTO POR DEFINIR]` por completar.
- **Fidelización: NO se recolecta todavía.** Guardar teléfonos "para cuando exista" sería el cambio
  de finalidad que hay que evitar. El diseño de dos ciclos de vida separados está en §5 del plan.
- **Respaldo con rotación** (conserva 3): desde que puede contener teléfonos, cada archivo viejo es
  una copia más de datos personales en el disco. Verificado que el repo **no** está en OneDrive.
- **Base demo sin teléfonos**, con el motivo escrito en el sembrador para que nadie lo "mejore".
- `npm test` **126/126** (91 + 35 nuevos), `tsc`, `eslint` y `build` limpios.

**Pendiente antes del primer teléfono real de un cliente que no seas vos:** la búsqueda y borrado por
teléfono en el panel de super-admin (derecho de supresión), completar los `[CONTACTO POR DEFINIR]`, y
la revisión legal del contrato de encargo.

### 2026-08-13 — Sincronización de la documentación

Auditoría de este documento y de `CLAUDE.md` contra el código real, archivo por archivo. La bitácora
venía al día, pero las **secciones de referencia** —las que una sesión nueva lee primero— se habían
quedado en la Fase 5. Encontrado y corregido:

- **`src/proxy.ts` no existe.** Se renombró a `src/middleware.ts` en la consolidación T5 y la entrada
  fechada lo registraba, pero la estructura de carpetas y la sección de seguridad seguían nombrando
  el archivo viejo, igual que `CLAUDE.md`. Era el único error de hecho: un archivo inexistente
  citado como vigente en dos documentos.
- **Faltaban seis archivos en la estructura**, entre ellos `dashboard/reportes/page.tsx` —la página
  de reportes completa, desde F6— y los cuatro de suscripción de F10, más `lib/color.ts` y
  `lib/suscripcion.ts`.
- **Faltaban tres scripts** en la lista de operación: `respaldo-db.mjs` (con su advertencia de
  paginación), `sembrar-demo.mjs` y `con-env.mjs`.
- El pitch decía 89 pruebas automáticas; son 91.
- Las descripciones de la landing y de `/dashboard/admin` describían versiones anteriores.

Las menciones a `proxy.ts` dentro de entradas fechadas de julio **se dejaron intactas**: ahí el
archivo sí se llamaba así, y una bitácora que se reescribe deja de ser una bitácora.

### 2026-08-13 — Prueba gratis de 7 días (bajada desde 30)

Decisión del dueño: la prueba pasa de 30 a **7 días**. Con los 7 de gracia que ya existían, la
exposición máxima sin cobrar queda en **14 días**. El razonamiento comercial es que una semana es un
ciclo completo de un local de comida —incluye su fin de semana—, así que alcanza para decidir.

- **`src/lib/suscripcion.ts` (nuevo):** `DIAS_PRUEBA` y `DIAS_GRACIA` en un solo lugar. La cifra
  estaba escrita a mano en cinco archivos y `DIAS_GRACIA` vivía duplicada entre el aviso del
  dashboard y la base. La **regla** sigue en Postgres (`situacion_suscripcion`), que es el único
  lado que puede cortar un pedido; acá solo están los números que la UI necesita repetir.
- La acción del panel de super-admin pasó de `prueba_30` a `prueba` — el nombre ya no lleva la cifra
  adentro, así que cambiarla no vuelve a exigir tocar el contrato del endpoint.
- **Dos tests nuevos.** Uno verifica contra la base que el último día de gracia todavía recibe
  pedidos y el siguiente no, es decir que `DIAS_GRACIA` de TypeScript coincide con lo que aplica
  Postgres: si se separan, el dashboard le promete al dueño un plazo que el servidor no respeta.
  El otro fija la cifra de la prueba y la suma 7 + 7 = 14.
- Actualizados los tres lugares donde se le promete al cliente: landing, pitch y plan comercial.
  El pitch suma una objeción nueva ("¿una semana es muy poco?") con la respuesta del ciclo semanal.

### 2026-08-13 — Landing: promesas reales, plan y accesibilidad

La página principal (`/`) prometía cosas que el producto no hace. Se reescribió sobre la misma regla
del [pitch](plan/PITCH-VENTAS.md): **no se promete nada que no se pueda demostrar en vivo**.

- **Tres promesas falsas eliminadas:** "el pedido llega a la cocina en menos de 1 segundo" (nunca se
  midió), "PWA instalable" (el manifiesto apunta a `icon-192.png` e `icon-512.png`, que **no
  existen** en `public/`) y "base de datos propia y control total" (la base es multi-tenant
  compartida; lo cierto es que sus datos son suyos y se exportan a CSV).
- **Precio en la página**, que antes no estaba: $29.900/mes, $249.900/año, prueba gratis y 7 de
  gracia, sin comisión ni permanencia. Es la decisión de F10 hecha pública.
- **Sección "Lo que todavía no hace"** con seis límites. Inusual en una landing y deliberado: un
  local que descubre los límites solo se siente engañado; uno al que se le dijeron de entrada confía
  en el resto.
- **Más profesional:** barra superior fija con navegación, jerarquía tipográfica real, cifras con
  `tabular-nums`, sentence case en todos los títulos (la página estaba en Title Case, contra la
  convención del proyecto) y muchísimo menos emoji. Se sacó el "MVP v1.0" del pie: un prospecto que
  lee "MVP" entiende "experimento".
- **Accesibilidad (afecta a todo el sitio):** el `viewport` tenía `maximumScale: 1` y
  `userScalable: false`, que **bloqueaban el zoom con dos dedos**. En una carta que se lee en un
  celular, con letra chica y a veces con poca luz, eso deja fuera a quien no ve bien (WCAG 1.4.4).
- Verificado en el navegador a 1280 y 375 px: sin desbordes horizontales, sin errores de consola, y
  el `meta viewport` ya permite zoom.
- **Pendiente menor:** el manifiesto sigue apuntando a dos iconos PNG inexistentes. Hasta que haya un
  icono de marca de verdad, la instalación como app no funciona (y ya no se promete).

### 2026-08-12 — Fase 10 (cierre): suscripción por local y pitch de ventas

Cierra la fase de negocio. Decisiones del dueño: **un solo plan** ($29.900/mes, $249.900/año, sin
comisión ni permanencia) y **7 días de gracia** antes de cortar. Plan en
[`plan/F10-SUSCRIPCION.md`](plan/F10-SUSCRIPCION.md).

- **Modelo de suscripción** (migración `20260812200500`): `locales` gana `plan`,
  `suscripcion_estado` (`prueba|activa|cortesia|cancelada`), `suscripcion_hasta` y
  `suscripcion_notas`. La regla vive en **una sola función**, `situacion_suscripcion(estado, hasta)`,
  que devuelve `cortesia | al_dia | por_vencer | gracia | pausada`; la consultan `crear_pedido`, el
  menú público y el dashboard para que no puedan discrepar.
- **Falla hacia abierto**: sin fecha registrada, el local se considera al día. Los dos locales que ya
  existían quedaron en **cortesía** — una migración no puede empezar a contarle los días a un local
  que ya está andando.
- **`crear_pedido` v8**: el corte está en la RPC, no en el navegador. La firma no cambió respecto de
  v7, así que se reemplazó en su lugar (sin DROP): nunca hubo dos versiones vivas.
- **La carta se sigue viendo pausada**, con un aviso neutro. `get_menu_publico` expone solo
  `pedidos_habilitados`; **el motivo no viaja al teléfono del comensal** y hay un test que verifica
  que el mensaje de error no lo delate.
- **El dashboard nunca se bloquea**: banner escalonado (por vencer → gracia → pausada), pero
  historial y reportes siempre accesibles.
- **`/api/admin/suscripcion`** (server-only, super-admin): cartera con la situación de cada local y
  acciones (+1 mes, +1 año, prueba gratis, cortesía, cancelar). Renovar extiende desde el
  vencimiento anterior si todavía no pasó, y desde hoy si ya pasó. Las columnas de suscripción **no
  tienen GRANT UPDATE para `authenticated`**: un local no puede prorrogarse solo (dos tests).
- **Alta de local**: nace con la prueba gratis contada en días de Chile, y la tarjeta de
  credenciales lo informa.
- **Migración `20260812202500`**: REVOKE de `PUBLIC, anon` sobre las dos funciones de suscripción.
  Postgres otorga EXECUTE a `PUBLIC` por defecto, así que el `GRANT ... TO authenticated` no
  restringía nada. Lo encontró un test.
- **`npm run db:backup` estaba truncando el respaldo en 1000 filas** (tope de PostgREST, silencioso).
  Ahora pagina, contrasta contra el conteo exacto de cada tabla y relee el archivo escrito para
  verificarlo tabla por tabla. El respaldo pasó de 1.000 a 7.929 pedidos reales.
- **Pitch de ventas** en [`plan/PITCH-VENTAS.md`](plan/PITCH-VENTAS.md), con una regla: cada promesa
  se demuestra en vivo en tres minutos. Incluye lo que el software **no** hace y notas internas que
  no van al cliente.
- Verificado además **contra la aplicación corriendo**: con `el-lalo` pausado la carta se sirve igual
  (HTTP 200, productos presentes), aparece el aviso y desaparecen los botones de agregar. Restaurado
  a cortesía al terminar. `npm test` **89/89**.

### 2026-08-12 — Fase 10 (parcial): propina sugerida y base demo

Primera parte de la fase de negocio, con **alcance acotado por decisión del dueño: la plata no pasa
por la plataforma.** Sin pagos ni boletas. Plan en
[`plan/F10-PROPINA-Y-DEMO.md`](plan/F10-PROPINA-Y-DEMO.md).

- **Propina sugerida** (migración `20260812142023`): botones 5/10/15/20 % más barra deslizable hasta
  30 %, por defecto 10 %. Dos decisiones que sostienen el resto:
  - **No se suma a `total`**, va en columna propia. La propina es del personal, no venta del local:
    mezclarla habría inflado la venta de todos los reportes de F6 con plata ajena.
  - **El cliente manda el porcentaje, no el monto**; el servidor lo calcula sobre su propio total.
    Un porcentaje fuera de rango se **acota** (500 → 100) en vez de tumbar el pedido: perder una
    venta real por un valor raro sería peor que cobrar propina cero.
- **`crear_pedido` v7**: se borró la versión de 6 argumentos, igual que en F8. El parámetro nuevo
  tiene `DEFAULT 0`.
- **Base demo en `el-lalo`** (`scripts/sembrar-demo.mjs`): **7.920 pedidos** de un año,
  $95.482.200 de venta, ticket $12.650. Estacionalidad por día de semana, peaks de almuerzo y cena,
  productos ponderados por precio y semilla fija (regenerar da la misma base). Marcado con prefijo
  `de70de70-` en `client_request_id` y reversible con `--borrar`; por defecto es dry-run.
  - Los eventos de auditoría se escriben con **fechas históricas**: el trigger los estampaba con
    `now()` y el reporte de tiempos habría dado cualquier cosa. Medido sobre los 7.920: 1 min 45 s
    hasta aceptar, 14 min hasta listo, 17 min hasta entregar.
  - **Dos bugs que encontró la corrida de prueba de 5 días:** `client_request_id` es `uuid` y
    Postgres no tiene `LIKE` para uuid, así que `--borrar` fallaba y los datos demo no se podían
    eliminar (se resolvió con un rango de uuid, que además usa el índice); y la conversión de hora
    chilena tenía el signo invertido, poniendo los pedidos a las 08:00 en vez de las 13:00.
- **Reportes**: presets "Este año" y "Año pasado", el gráfico pasa de días a **meses** sobre 62 días
  de rango, y tarjeta de **propinas separada de la venta**. Verificado: la suma diaria y la mensual
  cuadran exactamente.
- **Verificación:** `npm test` **75/75**, `tsc`/`eslint`/`build` limpios.

### 2026-08-12 — Fase 9: marca completa (white-label y contraste)

Resuelve **M2** (white-label a medias) y **M3** (el editor de identidad no validaba contraste). Plan
y decisiones en [`plan/F9-MARCA.md`](plan/F9-MARCA.md).

- **Hardcodes de naranja en el flujo del cliente: de 33 a 5**, y usos de las variables de marca de 11
  a 36. Los 5 que quedan son el aviso ámbar de cambios en el carrito.
- **El color semántico NO es marca.** El verde de "listo" y el rojo de "cancelado" quedaron intactos a
  propósito: son significado. Un local con marca roja no puede hacer que "listo" se vea como
  "rechazado".
- **Nueva utilidad `src/lib/color.ts`** con las fórmulas de contraste de la WCAG 2.1. El problema real
  no era el color sino el contraste: cambiar naranja por `var(--brand)` a secas habría dejado botones
  con texto blanco invisible en un local amarillo. De ahí salen dos variables derivadas:
  - **`--brand-texto`**: blanco o casi negro, el que se lea encima de la marca.
  - **`--accent-legible`**: el acento oscurecido lo justo para leerse sobre blanco, conservando el tono
    (para los precios no sirve elegir entre blanco y negro).
- **La pantalla de seguimiento no podía pintarse ni queriendo:** se renderiza con un `return` temprano
  **antes** del div que definía las variables. Se movieron al Server Component, envolviendo todo el
  flujo con `display: contents` — heredan por el árbol sin agregar una caja que altere el layout.
- **`/dashboard/config` muestra el contraste real** y una vista previa del botón y los precios. **No
  bloquea el guardado**: la marca es del dueño. El aviso es informativo y no una alerta ámbar, porque
  el naranja por defecto contrasta 2,8:1 y una alerta que sale siempre es una alerta que nadie lee.
- **Bug encontrado por la revisión adversarial, en mi propio código:** afirmé que el texto elegido
  siempre superaba AA y el test lo "confirmaba" con 8 colores. Un barrido del cubo RGB completo
  encontró el peor caso, **`#8c5aff` con 4,18:1**. Causa: el texto oscuro es `#1c1917`, no negro puro.
  Ahora `textoSobre` escala a los extremos cuando la pareja suave no alcanza, y el test **barre el
  cubo entero** (140.000+ colores) en vez de una muestra elegida a dedo.
- **Verificación:** `npm test` **65/65**, `tsc`/`build` limpios, y **`npm run lint` sin errores en todo
  el repo por primera vez**. Los tests de color son los primeros puros del proyecto: ~400 ms contra el
  minuto de los de integración.
- **Pendiente:** que alguien vea estas pantallas con un color que no sea naranja.

### 2026-08-12 — Fase 8: confianza (idempotencia + auditoría de estados)

Resuelve **A2** (pedidos duplicados por reintento) y la deuda que dejó F5: `updated_at` dejó de ser
confiable para analíticas al habilitarse la reapertura de entregas. Plan y decisiones en
[`plan/F8-CONFIANZA.md`](plan/F8-CONFIANZA.md).

- **Idempotencia de `crear_pedido`** (migración `20260812130411`): el navegador manda un
  `client_request_id` por intento de checkout; si ya existe un pedido con ese id, la RPC devuelve
  **ese** en vez de crear otro. Tres capas, porque el doble toque en el botón es real: chequeo al
  entrar, re-chequeo **dentro del advisory lock**, y manejador de `unique_violation`. Verificado
  contra la base con **tres reintentos simultáneos**: mismo id, un solo pedido.
  - El id **sobrevive a una recarga** (`localStorage`, TTL 2 h) y se persiste **antes** de llamar a
    la RPC: guardarlo después del `await` no cubriría nada, porque el caso es la respuesta que nunca
    llega.
  - Se **borró la versión de 5 argumentos** de la función: dejar las dos vivas permitiría seguir
    llamando la variante sin protección. El parámetro nuevo tiene `DEFAULT NULL`, así que un front
    no actualizado sigue funcionando.
  - **Limitación aceptada:** si el pedido entró, la respuesta se perdió y el cliente **cambia el
    carrito** antes de reintentar, recibe el pedido original con los ítems viejos. La alternativa
    (regenerar el id al cambiar el carrito) produce el duplicado que veníamos a evitar, que es peor:
    un ítem faltante lo resuelve el garzón; dos pedidos cocinados los paga el local.
- **`pedido_eventos`** (migración `20260812130413`): cada transición con su autor y su momento,
  alimentada por trigger. **Solo lectura por RLS**; escribe únicamente el trigger vía
  `SECURITY DEFINER`. Responde además "¿quién canceló este pedido?".
  > Ojo: sin política, un INSERT del staff falla con `42501`, pero UPDATE y DELETE devuelven **200
  > con 0 filas** — protegido igual, pero con éxito aparente. Los tests lo verifican con
  > service-role, no por el código de respuesta.
- **`reporte_tiempos` + tarjeta en `/dashboard/reportes`:** cuánto tarda el local en aceptar, dejar
  listo y entregar. **Medianas y no promedios**: un pedido olvidado media hora en pantalla arruina un
  promedio justo cuando más se mira la métrica. Solo aparece si hay pedidos medidos.
- **Anti-abuso: decisión pendiente del dueño, no un olvido.** El rate-limit por local frena ráfagas
  accidentales pero no a alguien decidido. Turnstile es la respuesta estándar (dependencia externa +
  claves); el límite por IP es **activamente malo** acá porque todos los comensales comparten el wifi
  del local. Recomendación registrada: no hacer nada hasta un incidente o ~20 locales.
- **Verificación:** `npm test` **58/58** (45 + 13), `tsc`/`eslint`/`build` limpios, 0 huérfanos.

### 2026-08-11 — Fase 7: rendimiento percibido (menú a Server Component)

Resuelve la deuda de rendimiento medida en la auditoría, más **A3** (precios congelados en el
carrito) y **M1** (enumeración pública). Plan y números en
[`plan/F7-RENDIMIENTO.md`](plan/F7-RENDIMIENTO.md).

- **`get_menu_publico(slug)`** (migración `20260811181119`): local + categorías + productos
  disponibles en **una** consulta, contra las dos oleadas secuenciales anteriores. Medido en la
  misma corrida: **385 ms → 185 ms** p50.
- **El menú es un Server Component.** `page.tsx` trae los datos en el servidor y
  `menu-cliente.tsx` se queda con la interactividad. Verificado sobre el HTML crudo: los nombres y
  precios están ahí **sin ejecutar JavaScript**. Antes eran 3-6 s en 4G hasta ver la carta.
- **Efectos secundarios gratis:** la mesa del QR se lee en el servidor (sin parpadeo, sin depender
  de la hidratación), un slug inexistente devuelve **404 real** en vez de 200, y `generateMetadata`
  pone nombre, slogan y logo del local al compartir el link por WhatsApp o Instagram.
- **El carrito ya no miente (A3):** al cargar el menú se reconcilia contra los productos vigentes —
  actualiza precios, saca lo agotado y **avisa al cliente qué cambió**, con nombre y monto, en vez
  de ajustarlo en silencio. El menú se refresca al volver a la pestaña.
- **Enumeración cerrada (M1):** revocada la lectura pública de `locales`, `categorias` y
  `productos`. **Cuidado para quien toque esto:** el dashboard leía esas tablas apoyándose en las
  *mismas* políticas públicas (nunca hubo SELECT para `authenticated`), así que la migración agrega
  las políticas de staff **antes** de quitar las públicas, en una transacción. Hay tests que fijan
  la invariante.
- **Lista blanca en vez de negra:** el JSON del menú enumera explícitamente las columnas públicas.
  Con la lista negra anterior, cualquier columna nueva de `locales` se publicaba por omisión — ya
  estaba pasando con `limite_pedidos_min`.
- **Verificación:** `npm test` **45/45**, `tsc`/`eslint`/`build` limpios, `src/app/local/` sin
  errores de lint (se arregló de paso un ref escrito durante el render en `order-status.tsx`).
- **Pendiente:** la medición con un celular real sobre 4G, que es el número que de verdad importa.

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
