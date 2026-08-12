# Fase 8 — Confianza

Resuelve el hallazgo **A2** (pedidos duplicados por reintento) de la
[auditoría del 2026-08-10](AUDITORIA-2026-08-10.md) y la deuda que dejó abierta la Fase 5:
`updated_at` dejó de ser confiable para analíticas cuando se habilitó reabrir una entrega.

## Objetivo

**Que el sistema no le mienta a nadie sobre lo que pasó.** Ni a la cocina —cocinando dos veces un
pedido que el cliente mandó una sola vez—, ni al dueño —con métricas de tiempo calculadas sobre una
columna que se reescribe.

## Tareas

| # | Tarea | Tipo | Estado |
|---|-------|------|--------|
| F8.1 | Idempotencia de `crear_pedido` | SQL + TypeScript | [x] |
| F8.2 | Auditoría de cambios de estado | SQL | [x] |
| F8.3 | Tiempos reales de cocina en reportes | TypeScript | [x] |
| F8.4 | Tests | Tests | [x] |
| F8.5 | Docs, push y merge | Docs | [x] |
| — | Anti-abuso en el checkout | **Decisión del dueño** | Pendiente |

## F8.1 — Idempotencia

### El escenario
En 4G dentro de un local pasa de verdad: la RPC se ejecuta y **commitea**, pero la respuesta se
pierde en el camino de vuelta. El cliente ve un error, el carrito no se limpió, y toca "Enviar
pedido" otra vez. La cocina recibe dos pedidos idénticos y cocina los dos.

### La solución
El navegador genera un UUID por **intento de checkout** y lo manda en cada reintento. Si ya existe
un pedido con ese id, la función devuelve **ese** pedido en vez de crear otro.

Tres capas, porque el caso concurrente es real (el doble toque en el botón):
1. Comprobación al entrar a la función.
2. Re-comprobación **dentro del advisory lock**: dos reintentos simultáneos pueden haber pasado
   juntos la primera.
3. Manejador de `unique_violation` que devuelve el pedido del ganador, para que el perdedor de la
   carrera no reciba un error críptico.

El id **sobrevive a una recarga**: se persiste en `localStorage` (`garzon:checkout:<slug>`, TTL 2 h)
**antes** de que salga la llamada. Guardarlo después del `await` no serviría para nada — el caso que
se quiere cubrir es justamente el de la respuesta que nunca llega.

Se borra al confirmar el pedido, así que un segundo pedido legítimo no se deduplica contra el primero.

### Decisiones
- **Se borró la versión de 5 argumentos de `crear_pedido`.** Dejar las dos vivas significaría que
  cualquiera puede seguir llamando la variante sin protección. El parámetro nuevo tiene
  `DEFAULT NULL`, así que un front todavía no desplegado sigue funcionando.
- **Índice único parcial** (`WHERE client_request_id IS NOT NULL`): los pedidos históricos no tienen
  id y no deben chocar entre sí.

### Limitación conocida, aceptada a conciencia
Si el pedido entró, la respuesta se perdió, y el cliente **cambia el carrito** antes de reintentar,
la RPC devuelve el pedido **original** — con los ítems viejos — y la pantalla lo muestra como
confirmado. El ítem agregado no llega a la cocina.

Es inherente a atar el id al intento y no al contenido. La alternativa —cambiar el id cuando cambia
el carrito— produce el duplicado que veníamos a evitar, que operativamente es peor: un ítem faltante
lo resuelve el cliente pidiéndoselo al garzón; dos pedidos cocinados los paga el local.

## F8.2 — Auditoría de cambios de estado

`pedido_eventos` registra cada transición con su autor y su momento: un evento al crear el pedido y
uno por cada cambio de estado, alimentados por trigger.

- **Solo lectura por RLS, y solo del propio local.** No hay política de INSERT, UPDATE ni DELETE
  para nadie: escribe únicamente el trigger, vía `SECURITY DEFINER`. Una bitácora que la aplicación
  puede editar no sirve como auditoría.
  > **Detalle que confunde al leer los tests:** sin política, un INSERT del staff **falla** con
  > error `42501`, pero un UPDATE o un DELETE devuelven **200 con 0 filas afectadas** — no hay filas
  > visibles para esos comandos, así que PostgREST responde "no actualicé nada" en vez de un error.
  > La bitácora está igual de protegida, pero quien intente borrarla recibe un éxito aparente. Por
  > eso los tests no se conforman con el código de respuesta: verifican con service-role que la fila
  > siguió intacta.
- `local_id` va desnormalizado a propósito: la RLS y los reportes filtran por local, y así no hay
  que unir con `pedidos` en cada lectura.
- Responde además "¿quién canceló este pedido?", que en un local con varios turnos importa.

## F8.3 — Tiempos reales de cocina

`reporte_tiempos` calcula, desde la bitácora, cuánto tarda el local en aceptar, en dejar listo y en
entregar. Aparece como una tarjeta en `/dashboard/reportes`.

**Medianas, no promedios.** Un pedido olvidado media hora en la pantalla distorsiona un promedio y
vuelve la métrica inservible justo cuando más se la mira. La tarjeta solo aparece si hay pedidos
medidos: los históricos anteriores a F8 no tienen eventos y darían ceros engañosos.

Es la métrica con la que se le prueba al dueño que la cocina mejoró — el argumento de renovación al
final del mes de prueba.

## Decisión pendiente: anti-abuso en el checkout

La tercera pieza original de F8 **no se implementó**, porque la decisión no es técnica.

`crear_pedido` es ejecutable por cualquiera con la anon key, que viaja en el bundle. El rate-limit
por local (F5, configurable, default 40/min) frena ráfagas accidentales, pero **no** a alguien
decidido: satura igual y de paso deja fuera a los clientes buenos.

Las opciones, con su costo real:

| Opción | A favor | En contra |
|---|---|---|
| **Turnstile de Cloudflare** (recomendada) | Gratis, invisible para el 99% de los clientes, es el estándar | Dependencia externa, dos claves más que administrar, y hay que verificar el token en el servidor antes de llamar la RPC |
| **Límite por IP** | Sin dependencias | **Activamente mala acá:** todos los comensales de un local comparten el wifi, así que bloquearía clientes legítimos en plena hora peak |
| **No hacer nada por ahora** | Cero costo; con 5 pilotos el atacante decidido no es un modelo de amenaza realista | Queda expuesto si el producto crece o alguien se ensaña con un local |

Recomendación: **no hacer nada hasta que haya un incidente o más de ~20 locales**, y tener Turnstile
identificado como la respuesta cuando toque. Meter fricción en el checkout de un producto cuyo
argumento de venta es "pedir en 10 segundos" tiene un costo comercial que hoy no se justifica.

## Verificación

- Idempotencia probada contra la base real, incluidos **tres reintentos simultáneos**: mismo id
  devuelto, un solo pedido creado. Datos de prueba limpiados.
- Sin `client_request_id` se siguen creando pedidos distintos (compatibilidad con un front viejo).
- La auditoría registra creación y transiciones con su autor.
- `npm test` **58/58** (45 + 13 nuevos), `tsc`, `eslint` y `build` limpios. 0 huérfanos.

### Lo que los tests NO cubren
El manejador de `unique_violation` —la tercera capa, la que salva al perdedor de la carrera si dos
transacciones llegan juntas al INSERT— **no está ejercitado**. Los tres reintentos concurrentes del
test pasan por la segunda capa (el `SELECT` bajo el advisory lock), que los intercepta antes. Forzar
la tercera requiere dos sesiones SQL con `pg_sleep`, fuera del alcance de la suite actual.

### Nota para quien agregue tests acá
Los tiempos se miden a propósito sobre el **local B** del fixture, donde todos los pedidos recorren
la máquina de estados completa. Las cuatro medianas se calculan cada una sobre su propio conjunto
(`percentile_cont` ignora NULLs), así que en un local con pedidos a medio camino la relación
`seg_hasta_listo >= seg_hasta_aceptado` **no está garantizada**. Mover ese test al local A lo
volvería intermitente.
