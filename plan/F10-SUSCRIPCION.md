# Fase 10 (cierre) — Suscripción y pitch de ventas

Segunda mitad de la fase de negocio. La primera fue [propina y base demo](F10-PROPINA-Y-DEMO.md).
**La plata sigue sin pasar por la plataforma:** no hay pasarela de pago ni boletas. El local paga
por transferencia y acá solo se registra hasta cuándo está al día.

## Decisiones del dueño del producto

| Decisión | Elegida |
|---|---|
| Empaquetado | **Un solo plan.** $29.900/mes o $249.900/año, sin comisión por venta, sin permanencia. |
| Impago | **7 días de gracia**, después se pausan los pedidos nuevos. |
| Prueba gratis | **7 días** (bajada desde 30 el 2026-08-13). Con la gracia, la exposición máxima sin cobrar es de **14 días**. |

Un solo plan porque una venta puerta a puerta no aguanta una tabla comparativa, y porque inventar
un plan barato obligaría a apagar funciones que ya están construidas —empezando por los reportes,
que es justo lo que más le sirve a quien menos sabe leer su negocio.

## Tareas

| # | Tarea | Estado |
|---|-------|--------|
| F10.6 | Modelo de suscripción en la base | [x] |
| F10.7 | Corte de pedidos en el servidor | [x] |
| F10.8 | Aviso de vencimiento en el dashboard | [x] |
| F10.9 | Cartera de suscripciones del super-admin | [x] |
| F10.10 | Prueba gratis al dar de alta | [x] |
| F10.11 | Tests | [x] |
| F10.12 | Pitch de ventas | [x] |

## La regla, en un solo lugar

`situacion_suscripcion(estado, hasta)` traduce el estado administrativo y la fecha a una situación
efectiva: `cortesia`, `al_dia`, `por_vencer`, `gracia`, `pausada`. La consultan las tres partes que
tienen que coincidir — `crear_pedido`, el menú público y el dashboard. Si cada una repitiera la
aritmética de fechas, tarde o temprano una cortaría pedidos mientras otra mostraría "todo bien".

```
        hasta-7        hasta        hasta+7
───────────┬─────────────┬─────────────┬──────────▶
   al_dia  │ por_vencer  │   gracia    │  pausada
            (aviso suave) (aviso fuerte) (no entran pedidos)
```

**Falla hacia abierto.** Un local sin fecha registrada se considera al día. Pausar por error a un
local que sí pagó, un viernes a las 21:00 con las mesas llenas, cuesta muchísimo más que regalarle
unos días a uno que no pagó. Los dos locales que ya existían quedaron en **cortesía**: una migración
jamás debe empezar a contarle los días a un local que ya está andando.

## Tres decisiones que importan

**El corte está en `crear_pedido`, no en el navegador.** Ocultar el botón es una sugerencia; el
único lugar donde puede nacer un pedido es esa función, así que ahí se decide. La firma no cambió
respecto de v7, así que se reemplazó en su lugar: nunca hubo un instante con dos versiones vivas,
una de ellas sin el control.

**La carta se sigue viendo con los pedidos en pausa.** Un 404 haría ver el QR como roto delante de
los comensales. La carta queda visible —es la vitrina del local— y el aviso dice qué hacer ("pedile
al garzón"), no por qué. **El comensal nunca se entera de que el local no pagó**, y hay un test que
verifica que el mensaje de error no contenga las palabras que lo delatarían.

**El dashboard nunca se bloquea.** El historial, los pedidos del día y los reportes son datos del
local, no una función que se le arrienda. Si su cuenta vence deja de vender por la carta digital,
pero no pierde el acceso a lo suyo — y eso también es lo que se le promete en el pitch.

## Lo que un local no puede hacerse a sí mismo

Las columnas de suscripción no tienen `GRANT UPDATE` para `authenticated`. El único camino de
escritura es `/api/admin/suscripcion`, que es server-only y exige ser super-admin. Dos tests lo
comprueban desde una sesión real de staff: no puede prorrogarse la fecha ni pasarse a cortesía.

## Dos errores que encontró la verificación

1. **El respaldo venía cortado en 1000 filas.** `select("*")` de PostgREST tiene ese tope y **no
   avisa**: desde que se sembró la base demo, `npm run db:backup` guardaba 1000 de 7.929 pedidos con
   cara de estar completo. Ahora pagina y contrasta contra el conteo real de cada tabla; además
   relee el archivo escrito y verifica tabla por tabla, porque el umbral de bytes que había dejaba
   pasar un archivo de 0,5 KB.
2. **`anon` podía ejecutar las funciones de suscripción.** Postgres otorga EXECUTE a `PUBLIC` en
   toda función nueva, así que el `GRANT ... TO authenticated` no restringía nada. F6 lo había
   resuelto con un REVOKE explícito y esta migración lo omitió; lo encontró un test. No hubo fuga de
   datos —`estado_suscripcion` es INVOKER y `locales` no tiene lectura pública desde F7— pero el
   permiso no puede apoyarse en dos capas lejanas.

## Verificación

- `npm test` **89/89** (75 + 14 nuevos), `tsc`, `eslint` y `build` limpios.
- Regla comprobada caso por caso contra la base real, incluidos los bordes exactos (día 7 de gracia
  recibe, día 8 no).
- **Probado contra la aplicación corriendo**: con `el-lalo` pausado, la carta se sigue sirviendo con
  sus productos (HTTP 200), aparece el aviso y desaparecen los botones de agregar. El local quedó
  restaurado a cortesía al terminar.

## Pitch de ventas

[`plan/PITCH-VENTAS.md`](PITCH-VENTAS.md). Construido con una sola regla: **cada promesa se puede
demostrar en vivo en tres minutos**. Incluye lo que el software no hace (doce puntos, dichos antes
de que los pregunten), el manejo de objeciones, y una sección final de notas internas que **no** van
al cliente — entre ellas que nadie lo ha usado todavía, que los datos de la demo son simulados y que
hay que pasar Supabase a Pro antes del primer QR real.
