# T6 — Coherencia documental de `developer-context.md` (P2)

**Tipo:** solo documentación (ningún cambio de código).
**Hallazgos que resuelve:** B2 y B3 de [`AUDITORIA.md`](../AUDITORIA.md).

## Contexto

`developer-context.md` es la fuente de verdad viva del proyecto y tiene puntos desactualizados
respecto del código real. Esta tarea lo sincroniza. **Precaución:** editar quirúrgicamente, sin
reescribir secciones enteras ni cambiar el tono.

## Cambios exactos

1. **Sección "Clientes de Supabase (¡importante!)"** — dice "El proyecto usa **dos** clientes".
   Son **tres**. Cambiar a "tres" y agregar un tercer bullet:

   > - `src/lib/supabase/admin.ts` — cliente **admin** (service-role key, **SOLO SERVIDOR**).
   >   Bypassa RLS y opera auth admin. Únicamente lo importa el route handler
   >   `/api/admin/onboard`; jamás debe llegar a un client component.

2. **Sección "Estructura de Carpetas Clave"** — faltan las rutas de la Fase 4. Agregar bullets:

   > - `src/app/dashboard/menu/page.tsx`: gestión self-service del menú (categorías, productos,
   >   precios, disponibilidad, fotos).
   > - `src/app/dashboard/config/page.tsx`: identidad visual del local (nombre, slogan, colores,
   >   logo).
   > - `src/app/dashboard/admin/page.tsx`: alta de locales (solo super-admin).
   > - `src/app/api/admin/onboard/route.ts`: endpoint server-only de onboarding (service-role).
   > - `src/lib/supabase/admin.ts`: cliente admin (ver arriba).

   Y en el bullet de `migrations/`, actualizar la lista de ejemplos o generalizar a
   "migraciones SQL idempotentes de endurecimiento (fase0 … fase4-5)".

3. **Sección "Flujo del Cliente (móvil-primero)", punto 4** — dice que al pasar a `entregado`
   "se limpia solo". Ajustar según el estado real:
   - Si T5 **ya se aplicó**: el texto es correcto, solo verificar.
   - Si T5 **no se ha aplicado aún**: corregir a "cuando el pedido pasa a `listo`, el cliente ve la
     pantalla final y el pedido guardado se limpia al pulsar 'Hacer otro pedido' o al expirar el
     TTL de 3 h" y dejar un TODO apuntando a T5.

4. **Sección "Estructura de Base de Datos" → Tablas** — agregar `platform_admins` a la lista:

   > - **`platform_admins`:** marca qué usuarios son super-admins de la plataforma (pueden dar de
   >   alta locales vía `/api/admin/onboard`). RLS: cada quien lee solo su fila; se administra por
   >   service-role.

5. **Limitación conocida del onboarding (B3)** — en el Historial ya se describe el endpoint; añadir
   una nota en la sección de Seguridad (o donde se describe el onboarding en "Estado Actual"):

   > *Limitación conocida:* el rollback del onboarding es compensatorio (best-effort), no
   >   transaccional: si el borrado compensatorio falla puede quedar un usuario o local huérfano;
   >   se detecta revisando `locales` sin filas en `local_staff`.

6. **Si T2/T3/T4 ya están aplicadas al momento de ejecutar esta tarea**, reflejarlas donde
   corresponda (rate-limit y topes de `crear_pedido`, máquina de estados, columnas protegidas de
   `locales`, límites del bucket). Si no, no adelantarse.

7. Agregar la entrada fechada correspondiente en "Historial de actualizaciones".

## Criterios de aceptación

- Cada afirmación editada se verificó contra el código real (no copiar de esta tarea a ciegas:
  si el código ya cambió, mandan los archivos).
- No se modificó ningún archivo fuera de `developer-context.md` y `plan/README.md` (checkbox).

## Al terminar

Marcar T6 en `plan/README.md`, commit en rama `consolidacion/t6-docs`.
