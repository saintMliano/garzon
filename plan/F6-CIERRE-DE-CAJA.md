# Fase 6 — Cierre de caja

Plan ejecutable de la Fase 6. Resuelve el hallazgo **A5** de la
[auditoría del 2026-08-10](AUDITORIA-2026-08-10.md).

## Objetivo

**Que el dueño pueda responder "¿cuánto vendí?" sin que nosotros abramos una consola SQL.**

No es una feature cosmética: el [plan comercial](PLAN_COMERCIAL.md) ya se lo promete en la semana 4
del piloto — *"Presentar reporte de valor al dueño: este mes procesaste X pedidos"*. Hasta hoy ese
dato **no existía en el producto**. El header del dashboard mostraba un contador que se borraba a
medianoche y no había ningún histórico.

Es además el argumento de renovación: al final del mes gratis, la conversación "te cobro $29.900"
se gana o se pierde mostrando un número.

## Tareas

| # | Tarea | Tipo | Estado |
|---|-------|------|--------|
| F6.1 | RPCs de agregación (`reporte_ventas`, `_por_dia`, `_top_productos`) | SQL | [x] |
| F6.2 | Página `/dashboard/reportes` | TypeScript | [x] |
| F6.3 | Link "Reportes" en la navegación | TypeScript | [x] |
| F6.4 | Exportar a CSV | TypeScript | [x] |
| F6.5 | Tests de integración | Tests | [x] |
| F6.6 | Docs, push y merge a `main` | Docs | [x] |

## Decisiones de arquitectura

### La agregación va en Postgres, no en el navegador

Bajar todos los pedidos del mes al cliente y sumarlos en JavaScript habría sido más rápido de
escribir, pero contradice el principio del proyecto ("el servidor decide") y escala mal: el reporte
de un mes de un local con flujo son miles de filas viajando a una tablet para producir seis números.
Las tres RPCs devuelven agregados.

### `SECURITY INVOKER`, a diferencia de `crear_pedido`

Esta es la decisión importante y va contra el reflejo de copiar el patrón existente.

`crear_pedido` es `SECURITY DEFINER` **porque tiene que serlo**: el cliente anónimo no tiene ningún
permiso sobre `pedidos` y la función actúa en su nombre. Los reportes son el caso opuesto: quien
llama es staff autenticado, que **ya tiene** permiso de lectura sobre sus propios pedidos vía RLS.

Dejándolas como `INVOKER` (el default), **la RLS existente hace el aislamiento por local sola**. Un
usuario que consulte el `local_id` de otro no recibe un error ni datos: recibe ceros, porque no ve
ninguna fila. No hay ningún privilegio extra que se pueda escapar, y no hace falta escribir —ni
mantener correcta— una verificación de membresía dentro de cada función.

> Verificado en la base real: la cuenta de Catire Kaffe consultando el `local_id` de El Lalo recibe
> `venta_total: 0`, mientras el service-role ve que ese local tiene $67.900. Hay un test que lo
> fija, para que se ponga en rojo si alguien cambia estas funciones a `DEFINER`.

`anon` no tiene `EXECUTE` sobre ninguna de las tres.

### Todo en hora de Chile

Los cortes de día usan `America/Santiago`, igual que la numeración de pedidos. Un reporte que use la
zona horaria de la tablet mostraría las ventas de otro día si alguien configuró mal el dispositivo
— es el mismo defecto (M3) que se corrigió en el header del dashboard durante la consolidación T5.
`p_desde` y `p_hasta` son fechas de calendario chileno y ambas **inclusivas**.

### Qué cuenta como venta

El reporte distingue tres cosas en vez de dar un solo número:

- **Venta entregada** — pedidos en estado `entregado`. Es lo que debería estar en la caja, y el
  número con el que se concilia.
- **Pendiente** — aceptados, en preparación o listos. Todavía no es plata.
- **Rechazados** — excluidos de toda suma, pero se muestran contados: que un local rechace muchos
  pedidos es información valiosa, no ruido a esconder.

El ticket promedio se calcula sobre los no cancelados.

### Sin librerías de gráficos

Las barras son divs con `width` en porcentaje. Agregar una dependencia de charts para un gráfico de
barras habría sumado peso al bundle del dashboard —que corre en tablets modestas— a cambio de nada.

### Índice

`idx_pedidos_local_created` sobre `(local_id, created_at)`: el filtro de todos los reportes. Existían
índices sueltos de cada columna, pero el compuesto evita el bitmap-and cuando el rango es un mes.

## Fuera de alcance (deliberado)

- **Propina y pago en línea** — van en F10, junto con planes y suscripción.
- **Comparación contra períodos anteriores** ("+12% vs. el mes pasado") — necesita más historia real
  que 9 pedidos para significar algo.
- **Costos y margen** — requiere que el dueño cargue el costo de cada producto; es otra fase.
- **Reporte multi-local consolidado** — no hay ningún cliente con dos locales todavía.
