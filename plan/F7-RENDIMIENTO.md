# Fase 7 — Rendimiento percibido

Resuelve los hallazgos **A3** (precios congelados en el carrito) y **M1** (enumeración pública de
locales) de la [auditoría del 2026-08-10](AUDITORIA-2026-08-10.md), y la deuda de rendimiento que
esa auditoría midió.

## Objetivo

**Que el comensal vea la carta lo antes posible, y que lo que vea sea verdad.**

Son dos cosas distintas y las dos estaban mal. La carta tardaba en aparecer, y cuando aparecía podía
mostrar precios de hace dos horas.

## Tareas

| # | Tarea | Tipo | Estado |
|---|-------|------|--------|
| F7.1 | RPC `get_menu_publico`: todo el menú en una consulta | SQL | [x] |
| F7.2 | Menú a Server Component | TypeScript | [x] |
| F7.3 | `generateMetadata` por local | TypeScript | [x] |
| F7.4 | Reconciliar el carrito con los precios reales | TypeScript | [x] |
| F7.5 | Cerrar la enumeración pública | SQL | [x] |
| F7.6 | Medición y verificación | Verificación | [x] |

## El problema, con números

El camino hasta ver el primer producto era **serial**: HTML → bundle de JS → hidratar → consultar
`locales` por slug → recién ahí, con el id a la vista, consultar `categorias` + `productos`.

Esas dos oleadas se medían en **0,4-1,1 s desde fibra de escritorio**. En un celular con 4G
congestionado dentro de un local con muros, sumando descarga del bundle e hidratación, el tiempo
realista hasta ver la carta era de **3 a 6 segundos** — con el garzón o la fila mirando.

## Qué se hizo

### Una consulta en vez de dos oleadas

`get_menu_publico(slug)` devuelve local + categorías + productos disponibles en un solo viaje.
Medido en la misma corrida, contra el mismo dato (Catire Kaffe, 59 productos):

| Camino | p50 |
|---|---|
| Viejo: 2 oleadas desde el navegador | **385 ms** |
| Nuevo: 1 RPC | **185 ms** |

### El dato viaja dentro del HTML

`page.tsx` es ahora un Server Component: la consulta ocurre en el servidor —cerca de la base, no en
el celular— y el menú llega renderizado en el primer byte. Verificado sobre el HTML crudo, sin
ejecutar JavaScript: los nombres de producto y los precios están ahí.

La parte interactiva (búsqueda, carrito, checkout, seguimiento) vive en `menu-cliente.tsx`.

### Efectos secundarios que salieron gratis

- **La mesa del QR** (`?mesa=Mesa%205`) se lee en el servidor y llega puesta en el primer render, sin
  parpadeo y sin depender de que el JS haya hidratado. Eliminó un efecto de cliente.
- **404 real** para un slug inexistente, en vez de un 200 con cara de error: un QR mal impreso ya no
  se indexa como página válida.
- **Metadata por local** (`generateMetadata`): compartir el menú por WhatsApp o Instagram ahora
  muestra el nombre del local, su slogan y su logo, en vez del metadata genérico de Next.

### El carrito ya no miente

El carrito guardaba una copia congelada del producto —precio incluido— con TTL de 2 horas, y el menú
no se refrescaba nunca. Si el dueño subía un precio a mitad de servicio, el cliente veía un total y
el servidor le cobraba otro (el total real lo calcula Postgres, que es lo correcto: el que mentía era
el carrito).

Ahora, al cargar el menú, el carrito se **reconcilia**: se actualizan los precios que cambiaron, se
sacan los productos que ya no están, y —lo importante— **se le dice al cliente qué cambió**, con
nombre y monto, en vez de ajustarlo en silencio. Además el menú se refresca al volver a la pestaña.

### Enumeración cerrada (M1)

Con la anon key —que viaja en el bundle de cualquier navegador— se podía hacer `select * from
locales` y llevarse la cartera completa de clientes de la plataforma. Ya no: el menú se sirve por
`get_menu_publico`, que exige **saber el slug**, y la lectura pública de `locales`, `categorias` y
`productos` fue revocada.

> **La trampa que casi se pasa por alto:** el dashboard del staff leía esas tres tablas apoyándose en
> las **mismas** políticas públicas — nunca hubo una política de SELECT para `authenticated`
> (`fase4-1` agregó INSERT/UPDATE/DELETE, pero no SELECT). Quitar la lectura pública sin más habría
> roto el editor de menú, el de identidad, el selector de local y los nombres de producto en los
> reportes. La migración agrega las políticas de staff **antes** de quitar las públicas, en una sola
> transacción.

También se cambió el armado del JSON de lista **negra** (`to_jsonb(l) - 'activo'`) a lista **blanca**
de columnas: con la lista negra, cualquier columna futura de `locales` se publicaba por omisión — y
ya estaba pasando con `limite_pedidos_min`, una perilla de plataforma que viajaba al navegador de
cada comensal.

## Verificación

- `npm test` **45/45** (43 + 2 invariantes de enumeración).
- Anon: **0 filas** de `locales`, `categorias` y `productos`; `get_menu_publico` sigue funcionando.
- Staff: ve exactamente su local, sus 6 categorías y sus 59 productos; el selector del dashboard
  sigue armándose.
- HTML del servidor: la carta está presente sin ejecutar JS; `<title>`, `og:title` y `description`
  por local; `?mesa=` renderizada desde el servidor; 404 real para slug inexistente.
- `tsc`, `eslint` y `build` limpios. De paso quedó sin errores de lint todo `src/app/local/`.

## Pendiente

La prueba con un celular real sobre 4G. La medición de acá es de servidor y de base; el número que
importa de verdad —cuánto tarda la carta en aparecer en el teléfono de alguien sentado en la mesa—
solo se toma en el local.
