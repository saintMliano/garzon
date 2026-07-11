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
