# Roles por local y comanda del garzón

**Estado:** propuesta, sin construir. Pendiente de decisiones del dueño (§9).
**Fecha:** 2026-08-20

---

## 1. Estado actual (verificado en el código, no asumido)

`local_staff` es una tabla plana:

```sql
CREATE TABLE local_staff (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id uuid REFERENCES locales(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, local_id)
);
```

No hay columna de rol. Y **todas** las políticas RLS del proyecto usan
literalmente el mismo predicado:

```sql
EXISTS (SELECT 1 FROM local_staff s
        WHERE s.user_id = auth.uid() AND s.local_id = <tabla>.local_id)
```

Inventario de lo que ese predicado abre hoy:

| Tabla | Operaciones | Consecuencia de no tener rol |
|---|---|---|
| `pedidos` | SELECT, UPDATE | Cualquiera avanza y **cancela** pedidos |
| `pedido_items` | SELECT | — |
| `pedido_eventos` | SELECT | — |
| `categorias` | INSERT, UPDATE, DELETE | Cualquiera **borra categorías** |
| `productos` | INSERT, UPDATE, DELETE | Cualquiera **cambia precios** |
| `locales` | UPDATE | Cualquiera cambia marca, mesas, horarios |
| `storage.objects` (bucket de imágenes) | INSERT, UPDATE, DELETE | Cualquiera borra las fotos |

Más las RPC `reporte_ventas`, `reporte_ventas_por_dia` y `reporte_top_productos`,
que son `SECURITY INVOKER` y por lo tanto **quedan abiertas a cualquier fila de
`local_staff`**: el garzón ve la caja del día.

Además: el personal se administra **solo por SQL / service-role**. No hay
pantalla para dar de alta a nadie. `/api/admin/onboard` inserta la fila del
dueño y es el único camino existente.

Y un detalle de implementación que importa para el esfuerzo: **no existe
`dashboard/layout.tsx`**. La navegación está copiada a mano en las 6 páginas del
panel.

---

## 2. El problema en una frase

El dueño no puede darle acceso a su cocina sin darle también la caja, los
precios y el poder de borrar el menú.

Para vender esto a un local con empleados, eso es un bloqueador: nadie le
entrega a un garzón de temporada las llaves de su negocio.

---

## 3. Roles propuestos

Tres, y deliberadamente **no más**. El mercado objetivo son fuentes de soda de
1 a 5 personas donde el dueño suele ser también cajero y a veces cocinero;
modelar siete roles sería el error clásico de sobreingeniería para
micronegocios.

| Rol | Quién es | Pantalla de inicio |
|---|---|---|
| `dueño` | El dueño o su administrador | `/dashboard` (todo) |
| `cocina` | Quien cocina y despacha | `/dashboard` (solo el Kanban) |
| `garzon` | Quien toma pedidos en mesa | `/dashboard/comanda` |

### Matriz de permisos

| Acción | dueño | cocina | garzon |
|---|:--:|:--:|:--:|
| Ver el Kanban de pedidos | ✅ | ✅ | ✅ |
| Avanzar estado (nuevo → preparando → listo → entregado) | ✅ | ✅ | ✅ |
| **Cancelar** un pedido | ✅ | ✅ | ❌ |
| Reabrir una entrega (F5) | ✅ | ✅ | ❌ |
| Ver el teléfono del comensal (retiro) | ✅ | ✅ | ✅ |
| **Crear** un pedido desde la comanda | ✅ | ❌ | ✅ |
| Ver reportes / caja del día | ✅ | ❌ | ❌ |
| Exportar CSV | ✅ | ❌ | ❌ |
| Editar menú, precios, disponibilidad | ✅ | ❌ | ❌ |
| Subir o borrar fotos de productos | ✅ | ❌ | ❌ |
| Editar identidad, mesas, horarios | ✅ | ❌ | ❌ |
| Cambiar su propia contraseña | ✅ | ✅ | ✅ |
| Dar de alta o quitar personal | ✅ | ❌ | ❌ |

Dos decisiones con criterio que conviene discutir (§9):

- **Cocina puede cancelar, garzón no.** Cancelar es la acción destructiva del
  Kanban y quien la justifica frente al cliente es la cocina ("se nos acabó").
- **La disponibilidad de un producto** ("se acabó el lomito") es lo único del
  menú que la cocina necesita tocar en pleno servicio. Está en la matriz como
  ❌ por simplicidad, pero es la excepción más pedida en productos así.

---

## 4. Dónde se hace cumplir cada regla — la sección que importa

Esconder un enlace en React **no es un permiso**. Un garzón puede escribir
`/dashboard/reportes` en la barra de direcciones o abrir la consola y llamar la
RPC directo. Cada restricción necesita su contraparte en el servidor.

| Regla | Capa que la hace cumplir | Por qué ahí |
|---|---|---|
| Editar menú, precios, fotos, local | **RLS**: `AND s.rol = 'dueño'` en las 10 políticas + las 3 de storage | Es exactamente la misma forma de predicado que ya existe; el cambio es aditivo y no puede saltarse |
| Ver reportes | **Guarda dentro de cada RPC `reporte_*`** | ⚠️ Ver abajo |
| Cancelar y reabrir | **Máquina de estados** (`consolidacion-t3`) + política de UPDATE | Ya hay un trigger que valida transiciones; el rol entra ahí |
| Crear pedido desde la comanda | `crear_pedido` ya es `SECURITY DEFINER` y acepta `authenticated` | No requiere cambio de permisos |
| Qué pantallas se ven | React (`layout` + hook de rol) | **Solo cosmético.** Es UX, nunca la única defensa |

### ⚠️ Por qué los reportes no se pueden cerrar con RLS

Los reportes leen `pedidos`. La cocina **también** lee `pedidos`. Son las mismas
filas: la RLS no tiene forma de distinguir "las está viendo para cocinar" de
"las está sumando para ver la caja".

Hay dos salidas y una está vetada:

- ~~Pasar `reporte_*` a `SECURITY DEFINER` y chequear el rol adentro.~~
  **Descartada.** `CLAUDE.md` lo prohíbe explícitamente y hay un test en
  `tests/reportes.test.ts` que se pone en rojo si alguien lo hace. La razón
  original sigue siendo buena: siendo `INVOKER`, el aislamiento entre locales lo
  garantiza la RLS sola, sin código que pueda equivocarse.

- ✅ **Mantenerlas `INVOKER` y agregar una guarda de rol al principio del
  cuerpo**:

  ```sql
  IF NOT tiene_rol(p_local_id, ARRAY['dueño']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  ```

  Esto **no** cambia `prosecdef`, así que el test existente sigue verde y la
  regla de arquitectura se respeta: la RLS sigue haciendo el aislamiento entre
  locales, y la guarda solo agrega la separación de roles *dentro* del local.
  Son dos controles distintos, no uno reemplazando al otro.

---

## 5. Cómo se identifica cada persona — alternativas reales

Supabase Auth exige un correo. En una fuente de soda los garzones no tienen
correo de trabajo y rotan. Tres caminos:

### A) Una cuenta por persona, creada por el dueño ⭐ recomendada

El dueño escribe el nombre, elige el rol, y el sistema genera una credencial.
El correo puede ser sintético (`juan.ellalo@garzon.app`) — Supabase acepta
cualquier correo sintácticamente válido con `email_confirm: true` vía
service-role. **Es exactamente lo que ya hace `/api/admin/onboard`**, así que la
maquinaria existe y está probada.

- ✅ Seguridad real: cada quien tiene su sesión y se revoca individualmente.
- ✅ Atribución honesta: "este pedido lo tomó Juan".
- ✅ Cero infraestructura nueva.
- ❌ El dueño administra contraseñas ajenas. Para 2-4 personas es tolerable.

### B) PIN sobre un dispositivo compartido

La tablet queda con sesión iniciada como el local y cada persona marca cuatro
dígitos para identificarse. Es lo que hacen los POS de verdad (Toast, Square).

- ✅ La mejor experiencia cuando hay seis o más garzones y un solo dispositivo.
- ❌ Es un **segundo sistema de autenticación** que hay que construir y cuidar.
- ❌ Un dispositivo con la sesión abierta todo el día es superficie de ataque:
  quien lo tome entra sin credencial.
- ❌ El PIN no es la frontera de seguridad — lo es la sesión. Sirve para
  *atribuir* y *elegir pantalla*, no para proteger.

**Veredicto:** es el camino correcto **cuando un cliente lo pida**, no antes.

### C) Enlace mágico u OTP por correo

**Descartada.** Necesita SMTP y ya está documentado que el del plan gratis no es
confiable — es la misma razón por la que no existe "olvidé mi contraseña".

---

## 6. La comanda del garzón

### Alternativas

**Opción 1 — Que el garzón use la carta pública `/local/[slug]`.**
Costo cero. Pero está diseñada para un comensal eligiendo tres cosas con calma:
tiene fotos grandes, propina sugerida, campo de teléfono y un checkout de varios
pasos. Un garzón que necesita marcar doce ítems en cuarenta segundos pelea
contra la interfaz. Y el pedido no queda atribuido a nadie.

**Opción 2 — `/dashboard/comanda`, pantalla propia. ⭐ recomendada**
Diseñada para velocidad, no para seducir:

- Se elige la **mesa primero** (es lo único que el garzón sabe con certeza).
- Grilla densa de productos, **sin fotos** o con miniatura: nombre y precio en
  botones grandes. Un toque suma uno; el botón `−` resta.
- **Pestañas por categoría** más un buscador que filtra al tipear.
- Pestaña **"Frecuentes"** construida con `reporte_top_productos`, que **ya
  existe**: los doce productos más vendidos del local, que en una fuente de soda
  son el 70% de los pedidos. Es el mayor ahorro de tiempo por el menor esfuerzo.
- Pie fijo con el total y un botón grande **"Enviar a cocina"**.
- Nota por ítem, opcional, detrás de un toque secundario.

**Opción 3 — La carta pública con un modo `?staff=1`.**
**Rechazada explícitamente.** La carta pública es un Server Component alimentado
por `get_menu_publico(slug)` y su valor es justamente que es anónima y rápida.
Meterle rutas autenticadas mezcla dos modelos de seguridad en el archivo donde
menos conviene equivocarse.

### Detalles que ya están resueltos y hay que respetar

- `crear_pedido` **exige** `p_nombre` no vacío. El garzón no le pregunta el
  nombre a nadie: la comanda manda la **etiqueta de la mesa** como nombre
  (`"Mesa 4"`). No requiere migración.
- El rate-limit es de **40 pedidos por minuto y por local**
  (`limite_pedidos_min`), configurable. Un garzón no se acerca; no hay que
  tocarlo.
- `crear_pedido` es **idempotente** vía `p_client_request_id`. La comanda debe
  generar ese UUID **antes** de enviar y reusarlo si el garzón toca dos veces o
  se le corta el wifi. Esto no es opcional: es la diferencia entre un pedido y
  dos.
- `p_tipo_entrega` queda en `'mesa'` y `p_telefono` en NULL. **La comanda no
  pide teléfono** — no hay razón de negocio y sumaría un dato personal sin
  finalidad.

### Atribución: `pedidos.creado_por`

Una columna `uuid` nullable que `crear_pedido` rellena con `auth.uid()` cuando
quien llama está autenticado (`auth.uid()` funciona dentro de una función
`SECURITY DEFINER`: sale del JWT del request, no del rol de ejecución).

Son unas tres líneas y responde "¿quién tomó este pedido?" — que es la pregunta
que aparece el día que hay un reclamo o una propina en disputa. **Vale la pena
incluirla ahora**: retroactivamente es imposible, los pedidos ya pasados no se
pueden atribuir.

---

## 7. Fases

| # | Qué | Entregable | Riesgo |
|---|---|---|---|
| **R1** | Modelo de roles | `local_staff.rol` con CHECK, backfill de todo lo existente a `'dueño'`, helper `tiene_rol(local_id, roles[])`, `/api/admin/onboard` fijando `'dueño'` | **Alto si se hace mal**: si el backfill falla, el dueño pierde su local |
| **R2** | Hacer cumplir en el servidor | 10 políticas RLS más 3 de storage con `AND s.rol = 'dueño'`; guarda de rol en las 3 RPC `reporte_*`; cancelar y reabrir restringidos | Alto — toca el aislamiento |
| **R3** | Panel por rol | `dashboard/layout.tsx` (y de paso se elimina la navegación duplicada en 6 páginas), hook `useLocalActual()` → `{localId, rol}`, redirección por rol | Bajo |
| **R4** | Gestión de personal | `/dashboard/equipo` más `/api/local/equipo` (service-role, verifica que quien llama sea dueño **de ese** local) | Medio |
| **R5** | Comanda | `/dashboard/comanda` más `pedidos.creado_por` | Bajo |

**R4 no es opcional.** Sin pantalla para dar de alta gente, los roles existen
pero el dueño no puede usarlos y hay que crear cada cuenta por SQL.

Orden obligatorio: R1 → R2. R3, R4 y R5 pueden ir en paralelo después.

---

## 8. Casos borde y trampas

1. **El backfill es lo más peligroso de todo el plan.** La columna `rol` debe
   crearse con `DEFAULT 'dueño'` y `NOT NULL`, para que las filas existentes
   queden como dueño automáticamente. Si quedara NULL o `'garzon'`, el dueño de
   Catire Kaffe pierde su menú al siguiente deploy. Verificación obligatoria
   contra la base **antes** de tocar las políticas RLS.
2. **Todo local necesita al menos un dueño.** Si el único dueño se degrada a sí
   mismo, el local queda sin administrador y solo se arregla por SQL. Hace falta
   una guarda en el endpoint y, mejor, un trigger.
3. **El super-admin no tiene fila en `local_staff`.** Ya está documentado que
   por eso `/api/admin/suscripcion` usa service-role. Nada cambia, pero no hay
   que "arreglarlo" dándole una fila con rol.
4. **Una persona puede tener roles distintos en locales distintos.** La PK
   `(user_id, local_id)` ya lo permite y es correcto. El hook de rol debe leer
   el rol **del local activo**, no "el rol del usuario".
5. **Quitar a alguien no cierra su sesión.** El JWT sigue vivo hasta expirar.
   Borrar la fila de `local_staff` sí lo deja sin datos de inmediato (la RLS
   deja de encontrar la fila), que es lo que importa. Pero si hace falta cortar
   ya, hay que revocar la sesión con `auth.admin.signOut(userId)`.
6. **Las páginas del panel resuelven el local con su propia consulta a
   `local_staff`** — hay cuatro copias del mismo bloque. R3 las unifica; hasta
   entonces cualquier cambio hay que hacerlo cuatro veces.
7. **`updateUser({password})` cierra las demás sesiones.** Ya documentado. Con
   varias cuentas por local esto se vuelve más visible: si el dueño cambia su
   clave no afecta al garzón (son usuarios distintos), pero conviene que el
   aviso de `/dashboard/cuenta` siga siendo claro.

---

## 9. Decisiones que necesito del dueño

1. **¿Tres roles o dos?** ¿`garzon` y `cocina` separados, o un solo rol
   `personal` que hace ambas cosas? En una fuente de soda chica suele ser la
   misma persona.
2. **¿La cocina puede marcar un producto como agotado?** Es la única excepción
   razonable al "el menú lo toca solo el dueño", y es la que más se pide en
   pleno servicio.
3. **¿Quién puede cancelar un pedido?** Propuesta: dueño y cocina; garzón no.
4. **¿Se construye la comanda (R5) o primero solo los roles (R1–R4)?** Los roles
   solos ya son vendibles; la comanda es una función nueva que suma al pitch.
5. **¿`pedidos.creado_por` entra ahora?** Recomiendo que sí: es barato hoy e
   imposible de recuperar después.
