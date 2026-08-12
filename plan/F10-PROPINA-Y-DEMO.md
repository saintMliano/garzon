# Fase 10 — Propina sugerida y base demo

Primera parte de la fase de negocio. **Alcance acotado por decisión del dueño: la plata no pasa por
la plataforma.** Sin pagos, sin boletas, sin retención — el local cobra en su caja como siempre.

## Tareas

| # | Tarea | Tipo | Estado |
|---|-------|------|--------|
| F10.1 | Propina sugerida estilo Uber | SQL + TypeScript | [x] |
| F10.2 | Base demo con un año de datos en `el-lalo` | Script | [x] |
| F10.3 | Gráficos de mes y año en reportes | TypeScript | [x] |
| F10.4 | Tests | Tests | [x] |

## F10.1 — Propina

Botones de 5, 10, 15 y 20 % (más "Sin propina") y una barra deslizable hasta 30 %. Por defecto 10 %,
que es la referencia en Chile, y bajarla a cero es un solo toque.

### Dos decisiones que sostienen todo lo demás

**La propina NO se suma a `total`.** Va en su propia columna. La propina no es venta del local: es
del personal. Mezclarla habría inflado la "venta" de todos los reportes de F6 con plata ajena, y el
dueño calcularía su negocio sobre un número falso. En la pantalla ve las dos cifras separadas.

**El cliente manda el porcentaje, no el monto.** El servidor calcula la propina sobre el total que él
mismo acaba de computar. Es el mismo principio que rige el resto del sistema desde la Fase 0: el
navegador no decide plata. Un porcentaje fuera de rango **se acota** (500 → 100, −30 → 0) en vez de
tumbar el pedido: perder una venta real por un valor raro sería peor que cobrar propina cero.

### Lo que la idempotencia implica acá
El porcentaje **no** forma parte de la clave de idempotencia. Si el comensal envía, pierde señal,
cambia la propina y reintenta, recibe el pedido original con la propina del primer intento. Es la
conducta correcta —no duplicar manda— pero la propina queda congelada en el primer envío.

## F10.2 — Base demo

`scripts/sembrar-demo.mjs` genera un año de historia verosímil en `el-lalo`: **7.920 pedidos**,
$95.482.200 de venta, ticket promedio $12.650.

- **Estacionalidad real**: viernes y sábado ~1,7×, lunes el más flojo. Peaks de almuerzo y cena, sin
  pedidos a las 4 de la mañana.
- **Productos ponderados por precio**: las bebidas se venden más que un lomito, así que el top de
  productos se parece al de un local de verdad.
- **Aleatoriedad con semilla fija**: regenerar produce exactamente la misma base, así que las cifras
  que uno acaba de mostrarle a alguien no cambian solas.
- **Marcado y reversible**: todo pedido lleva `client_request_id` con prefijo `de70de70-`.
  `--borrar` lo elimina sin tocar un solo pedido real. Por defecto el script es dry-run.

### Los eventos de auditoría, con fechas históricas
`pedido_eventos` la alimenta un trigger que estampa `created_at = now()`. Al insertar pedidos
históricos, los eventos habrían quedado todos con la fecha de hoy y el reporte de tiempos de cocina
habría dado cualquier cosa. El script borra los eventos que genera el trigger y escribe la línea de
tiempo real de cada pedido, con saltos verosímiles. Resultado medido sobre los 7.920:
**1 min 45 s hasta aceptar, 14 min hasta estar listo, 17 min hasta entregar.**

### Dos bugs que encontró la corrida de prueba
Sembrar 5 días antes del año completo valió exactamente por esto:

1. **`client_request_id` es de tipo `uuid`, y Postgres no tiene `LIKE` para uuid.** El `--borrar`
   fallaba con error — es decir, los datos demo no se podían eliminar. Se resolvió consultando el
   prefijo como un **rango de uuid** (`>= de70de70-0000… AND < de70de71-0000…`), que además usa el
   índice en vez de un cast a texto.
2. **La conversión de hora chilena tenía el signo invertido**: los pedidos caían a las 08:00 y 15:00
   en vez de 13:00 y 20:00. Ahora se le pregunta el desfase al motor de zonas y se resta; verificado
   en enero (UTC−3) y agosto (UTC−4).

## F10.3 — Gráficos de mes y año

- Presets nuevos: **Este año** y **Año pasado**.
- El gráfico cambia de días a **meses** cuando el rango supera 62 días: un año en barras diarias son
  365 rayas ilegibles.
- Tarjeta de **propinas** en el desglose, separada de la venta y etiquetada como tal.

Verificado sobre los datos demo: la suma de la serie diaria y la de la mensual **cuadran exactamente**
($95.482.200 por ambos caminos).

## Verificación

- `npm test` **75/75** (65 + 10 nuevos), `tsc`, `eslint` y `build` limpios.
- Propina probada contra la base: calculada en el servidor, `total` nunca contaminado, fuera de rango
  acotado, el staff no puede modificarla, y un pedido cancelado no aporta su propina al reporte.
- Coherencia de los datos demo comprobada: totales que cuadran con sus ítems, propinas bien
  calculadas, numeración correlativa por día desde 1, y cero eventos con fecha de hoy.

## Pendiente de la fase de negocio

Planes y suscripción quedan fuera de esta entrega. Y sigue sin verificarse con ojos humanos todo lo
construido desde F5: la decisión del dueño es terminar el producto y la propuesta comercial antes de
la primera prueba en terreno.
