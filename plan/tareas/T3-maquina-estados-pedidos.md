# T3 — Máquina de estados de pedidos + UPDATE restringido a `estado` (P1)

**Tipo:** SQL (una migración).
**Hallazgo que resuelve:** S3 de [`AUDITORIA.md`](../AUDITORIA.md).

## Contexto

Hoy el staff autenticado puede hacer `UPDATE pedidos SET estado = <lo que sea>` (el
compare-and-set vive solo en el cliente, `src/app/dashboard/page.tsx` → `updateStatus`) y además
la RLS le permite modificar **cualquier columna**, incluido `total`. Esta tarea impone en el
servidor:

1. Solo se pueden hacer las transiciones válidas del Kanban.
2. El rol `authenticated` solo puede actualizar la columna `estado`.

Transiciones válidas (coinciden con la UI actual — el botón "Rechazar" no existe en la columna
"Listos"):

```
nuevo      → aceptado | cancelado
aceptado   → preparando | cancelado
preparando → listo | cancelado
listo      → entregado
entregado  → (terminal)
cancelado  → (terminal)
```

## Pasos

1. Crear `migrations/consolidacion-t3-maquina-estados.sql` con **exactamente**:

```sql
-- ============================================
-- GARZÓN DIGITAL — Consolidación T3: máquina de estados de pedidos
-- Trigger que valida las transiciones de estado en el servidor y
-- privilegios de columna: authenticated solo puede actualizar `estado`.
-- Idempotente.
-- ============================================

-- 1. Trigger de transiciones
CREATE OR REPLACE FUNCTION public.validar_transicion_pedido()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- UPDATEs que no cambian el estado (p.ej. correcciones vía service-role)
  -- pasan sin validar transición.
  IF NEW.estado = OLD.estado THEN
    RETURN NEW;
  END IF;

  IF (OLD.estado = 'nuevo'      AND NEW.estado IN ('aceptado', 'cancelado'))
  OR (OLD.estado = 'aceptado'   AND NEW.estado IN ('preparando', 'cancelado'))
  OR (OLD.estado = 'preparando' AND NEW.estado IN ('listo', 'cancelado'))
  OR (OLD.estado = 'listo'      AND NEW.estado = 'entregado')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transición de estado inválida: % → %', OLD.estado, NEW.estado;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_transicion ON pedidos;
CREATE TRIGGER trg_pedidos_transicion
  BEFORE UPDATE OF estado ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_transicion_pedido();

-- 2. Privilegios de columna: el staff solo actualiza `estado`.
--    (La RLS de Fase 0 sigue decidiendo QUÉ filas; esto decide QUÉ columnas.)
REVOKE UPDATE ON pedidos FROM authenticated;
REVOKE UPDATE ON pedidos FROM anon;
GRANT UPDATE (estado) ON pedidos TO authenticated;

-- VERIFICACION
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'pedidos'::regclass AND NOT tgisinternal;
-- SELECT grantee, column_name, privilege_type FROM information_schema.column_privileges
--   WHERE table_name = 'pedidos' AND privilege_type = 'UPDATE';
```

2. Aplicarla en el SQL Editor de Supabase.

> Nota: el trigger también aplica al service-role (los triggers no se saltan por rol). Si alguna
> vez se necesita una corrección manual de estado fuera de la máquina, hacerla con
> `ALTER TABLE pedidos DISABLE TRIGGER trg_pedidos_transicion; ... ; ENABLE TRIGGER ...` en el SQL
> Editor. No agregar bypass en el trigger.

## Criterios de aceptación

- El flujo completo del Kanban sigue funcionando: Aceptar → A Cocina → ¡Listo! → Entregar, y
  Rechazar desde nuevo/aceptado/preparando.
- Desde el SQL Editor (como `postgres`): `UPDATE pedidos SET estado = 'nuevo' WHERE estado = 'cancelado'`
  falla con "Transición de estado inválida".
- Con la sesión de staff (browser devtools en el dashboard):
  `await supabase.from('pedidos').update({ total: 1 }).eq('id', '<id>')` devuelve error de
  permisos (la columna `total` ya no es actualizable por `authenticated`).

## Verificación

1. Crear un pedido de prueba desde `/local/el-lalo` y pasarlo por TODOS los estados desde el
   dashboard (incluido rechazar otro pedido de prueba). El cliente debe ver la pantalla de
   cancelado / progreso normal.
2. Probar las transiciones inválidas del criterio de aceptación.
3. **Limpiar** los pedidos de prueba (DELETE por `nombre_cliente` de prueba, como en T2).

## Qué NO hacer

- No tocar la RLS existente de `pedidos` (las políticas de Fase 0 quedan igual).
- No cambiar `src/app/dashboard/page.tsx`: el compare-and-set del cliente sigue siendo útil como
  primera línea (UX), el trigger es la garantía real.
- No permitir `listo → cancelado` (la UI no lo ofrece; si el dueño lo pide algún día, será una
  decisión de producto).

## Al terminar

Marcar T3 en `plan/README.md`, entrada fechada en `developer-context.md`, commit en rama
`consolidacion/t3-maquina-estados`.
