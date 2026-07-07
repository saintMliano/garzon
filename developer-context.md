# Garzón Digital - Contexto de Diseño y Desarrollo

Este documento sirve como transferencia de contexto de diseño (UX/UI) y arquitectura de desarrollo para que cualquier instancia de IA o desarrollador pueda continuar el proyecto sin perder la línea conceptual.

---

## 🎨 Contexto de UX/UI y Diseño Visual

### Concepto de Marca y Producto
- **Garzón Digital:** Es una solución de digitalización de pedidos para restaurantes y fuentes de soda. Permite a los clientes pedir desde la mesa escaneando un código QR y al local gestionar todo desde una pantalla en la cocina sin intermediarios ni comisiones.
- **Estilo Visual:** 
  - **Modo Oscuro del Dashboard (`dashboard-dark`):** Diseñado específicamente para pantallas de cocina y tablets. Reduce la fatiga visual bajo luces intensas y destaca los pedidos con colores semánticos.
  - **Acento Energizante:** Degradados cálidos de naranja a ámbar (`from-orange-500 to-amber-500`) que evocan dinamismo, velocidad y apetito.

### Detalles de Micro-UX e Interacción en el Dashboard
El panel de cocina cuenta con detalles interactivos avanzados para simular un sistema nativo de punto de venta:
1. **Notificación Sonora Nativa (`playNotificationSound`):** Genera un pitido electrónico doble utilizando la API de `AudioContext` del navegador de forma puramente matemática (sin archivos de audio externos que puedan fallar en cargar).
2. **Temporizador Dinámico de Alerta (`TimerBadge`):** Muestra los minutos y segundos transcurridos desde que se hizo el pedido. Cambia de color dinámicamente según la demora del pedido:
   - **Gris/Neutral:** Menos de 8 minutos.
   - **Ámbar (Advertencia):** Entre 8 y 15 minutos.
   - **Rojo (Peligro/Retrasado):** Más de 15 minutos.
3. **Retroalimentación Háptica:** Utiliza la API de vibración del navegador (`navigator.vibrate`) en dispositivos compatibles al detectar un nuevo pedido.
4. **Pestaña del Navegador Dinámica:** Cambia el título de la página para alertar al cocinero si está en otra pestaña: `(Cantidad de nuevos) 🔔 Nuevo Pedido | Garzón Digital`.

### Flujo Kanban de Cocina
Los pedidos avanzan secuencialmente a través de 4 columnas interactivas:
- **Nuevos** ➡️ **Aceptados** ➡️ **En Cocina** ➡️ **Listos** ➡️ *Entregado* (se archiva fuera del dashboard activo).

---

## 🛠️ Stack Tecnológico y Arquitectura de Desarrollo

### Tecnologías Principales
- **Framework:** Next.js (App Router, React 19, TypeScript).
- **Estilos:** TailwindCSS con variables personalizadas para el modo oscuro (`dashboard-dark`).
- **Base de Datos y Tiempo Real (Core):** Supabase. El dashboard utiliza canales en tiempo real (`supabase.channel().on('postgres_changes')`) para recibir de manera inmediata y sin recargar la página cualquier pedido ingresado por los clientes.

### Estructura de Base de Datos (Supabase)
Definida en el archivo [supabase-schema.sql](file:///c:/Users/usuario/Documents/AGENTES/garzon-digital/supabase-schema.sql):
- **`pedidos`:** Registra número de pedido, mesa, nombre del cliente, total, notas generales y estado (`nuevo`, `aceptado`, `preparando`, `listo`, `entregado`).
- **`pedido_items`:** Tabla relacional que vincula cada pedido con sus productos correspondientes, incluyendo cantidad, notas específicas (ej. "sin cebolla") y precio unitario.
- **`productos`:** Catálogo de productos disponibles con nombres, precios, fotos y categorías.

### Estructura de Carpetas Clave
- `src/app/page.tsx`: Landing page comercial que presenta el servicio y redirige al Dashboard o a la demo del cliente.
- `src/app/dashboard/page.tsx`: Tablero Kanban de cocina interactivo con suscripción en tiempo real a Supabase, temporizadores y alarmas sonoras.
- `src/app/local/[slug]/`: Ruta dinámica que renderiza la carta digital del local para el cliente (ej. `/local/el-lalo`).
- `src/lib/cart-context.tsx`: Contexto de React para gestionar el carrito de compras local del cliente.
- `src/lib/supabase.ts`: Cliente de conexión configurado con variables de entorno `.env.local`.

---

## 🚀 Estado Actual y Próximos Pasos

### Implementado
- [x] Landing page del producto.
- [x] Menú dinámico auto-administrable del cliente móvil-primero con carrito de compras local.
- [x] Dashboard Kanban de cocina con integración Supabase en tiempo real.
- [x] Alertas sonoras, hápticas y de pestaña dinámicas para nuevos pedidos.
- [x] Temporizadores visuales con alertas semánticas de retraso por pedido.

### Pendiente / Futuro
- [ ] Generación automática de códigos QR con la mesa preestablecida en la URL (ej. `/local/el-lalo?mesa=5`).
- [ ] Módulo de pago en línea integrado (Webpay / Stripe) opcional antes de procesar el pedido.
- [ ] Control de stock (inventario) automático al vender productos.
- [ ] Dashboard de administración histórica y analíticas de venta diaria/mensual.
