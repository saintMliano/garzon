# T5 — Fixes del cliente: polling hasta `entregado`, stats con hora de Chile, link admin (P2)

**Tipo:** TypeScript (3 fixes independientes en el frontend).
**Hallazgos que resuelve:** M2, M3 y B1 de [`AUDITORIA.md`](../AUDITORIA.md).

## Fix 1 — El seguimiento del cliente debe ver `entregado` (M2)

**Archivo:** `src/app/local/[slug]/order-status.tsx`.

**Problema:** dentro de `fetchStatus` el intervalo se detiene cuando el estado entra en
`['listo', 'entregado', 'cancelado']`. Como se detiene en `listo`, el cliente nunca observa el
paso a `entregado`, así que `onDelivered` (que auto-limpia el pedido guardado y vuelve al menú)
no se dispara nunca.

**Cambio:** seguir sondeando en `listo` (más lento para no gastar batería) y detenerse solo en
estados terminales. Reemplazar el bloque:

```ts
if (["listo", "entregado", "cancelado"].includes(newStatus) && intervalId) {
  clearInterval(intervalId);
}
```

por:

```ts
if (["entregado", "cancelado"].includes(newStatus) && intervalId) {
  clearInterval(intervalId);
} else if (newStatus === "listo" && intervalId) {
  // El pedido ya está listo: bajar la frecuencia mientras se espera la entrega.
  clearInterval(intervalId);
  intervalId = setInterval(fetchStatus, 15000);
}
```

## Fix 2 — Estadísticas del día con hora de Chile (M3)

**Archivo:** `src/app/dashboard/page.tsx`, dentro de `fetchPedidos` (consulta de `todayStats`).

**Problema:** la medianoche se calcula con el reloj/zona del navegador
(`const today = new Date(); today.setHours(0,0,0,0)`), mientras la numeración de pedidos usa
`America/Santiago` en el servidor. Una tablet con zona horaria mal configurada muestra
estadísticas de otro día.

**Cambio:** calcular la medianoche de Chile explícitamente. Reemplazar:

```ts
const today = new Date();
today.setHours(0, 0, 0, 0);
```

por:

```ts
// Medianoche de HOY en America/Santiago (consistente con la numeración de
// pedidos, que también usa la hora de Chile), independiente de la zona de
// la tablet.
const now = new Date();
const chileNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
const offsetMs = now.getTime() - chileNow.getTime();
chileNow.setHours(0, 0, 0, 0);
const today = new Date(chileNow.getTime() + offsetMs);
```

(`today.toISOString()` se sigue usando igual en el `.gte(...)` existente.)

## Fix 3 — Ocultar "Alta de local" a quien no es super-admin (B1)

**Archivos (los 4 tienen el link en su nav):**
- `src/app/dashboard/page.tsx` (≈ línea 333)
- `src/app/dashboard/menu/page.tsx` (≈ línea 360)
- `src/app/dashboard/config/page.tsx` (≈ línea 199)
- `src/app/dashboard/admin/page.tsx` (≈ línea 236)

**Problema:** el link "Alta de local" se muestra a todo el staff. La página en sí está bien
gateada (cliente + servidor), pero el link confunde y revela una función de plataforma.

**Cambio (mismo patrón en cada página):**

1. Agregar estado `const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);`
2. En el `useEffect` inicial que ya resuelve al usuario (en `dashboard/page.tsx` es
   `resolveLocal`; en las otras páginas el efecto equivalente que llama `supabase.auth.getUser()`),
   agregar tras obtener el `user`:

```ts
const { data: adminRow } = await supabase
  .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
setIsPlatformAdmin(!!adminRow);
```

   (La RLS "read own admin row" permite esta consulta; devuelve fila solo si el usuario es admin.
   `dashboard/admin/page.tsx` ya hace exactamente esta consulta — reutilizar su `isAdmin` existente
   en vez de duplicarla.)
3. Envolver el `<Link href="/dashboard/admin">…Alta de local…</Link>` en
   `{isPlatformAdmin && ( ... )}`.

## Criterios de aceptación

- Cliente: con un pedido en `listo`, al marcarlo "Entregar" en cocina, la pantalla del cliente
  vuelve sola al menú en ≤ 15 s y el `localStorage` (`garzon:order:<slug>`) queda limpio.
- Dashboard: las stats "Pedidos/Venta" muestran lo mismo que antes en una tablet bien configurada
  (verificar que no se rompió nada); el cálculo ya no depende de `setHours` local directo.
- El staff normal (cuenta demo `el-lalo`, si no es platform admin) no ve "Alta de local" en
  ninguna de las 4 páginas; el super-admin sí lo ve en todas.
- `npm run lint` y `npm run build` pasan.

## Verificación

1. Flujo real completo: pedido desde el móvil → cocina lo lleva hasta "Entregar" → la pantalla del
   cliente se auto-limpia. Probar también un rechazo (pantalla de cancelado se mantiene).
2. Login con ambas cuentas (staff demo y super-admin) y revisar la nav en las 4 páginas.
3. **Limpiar** los pedidos de prueba en la base.

## Qué NO hacer

- No convertir nada a Server Component ni tocar el theming (eso es Fase 6/7).
- No cambiar el gate de `/dashboard/admin` (ya es correcto); esto es solo visibilidad del link.

## Al terminar

Marcar T5 en `plan/README.md`, entrada fechada en `developer-context.md`, commit en rama
`consolidacion/t5-fixes-cliente`.
