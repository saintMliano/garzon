-- ============================================
-- GARZÓN DIGITAL — Fase 4.5: Trigger de updated_at en pedidos
-- Mantiene pedidos.updated_at en el servidor ante cualquier UPDATE, sin
-- depender de que el cliente lo setee. Base para analíticas de tiempos.
-- Idempotente.
-- ============================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_updated_at ON pedidos;
CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- VERIFICACION
-- UPDATE pedidos SET estado = estado WHERE id = '...' ; luego comparar updated_at vs created_at
