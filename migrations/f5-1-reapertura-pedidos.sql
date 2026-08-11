-- ============================================
-- GARZÓN DIGITAL — F5.1: reapertura de pedidos entregados
--
-- Problema (auditoría 2026-08-10, hallazgo B5): `entregado` era terminal y el
-- botón "Entregar" no pedía confirmación. Un toque accidental en la tablet
-- durante el servicio borraba el pedido de la pantalla para siempre, sin
-- ninguna forma de recuperarlo.
--
-- Se agrega una única transición de vuelta: entregado → listo. Alcanza para
-- deshacer el error (el pedido vuelve a la columna "Listos") y no abre la
-- puerta a resucitar pedidos cancelados, que el cliente ya vio como tales.
--
-- Idempotente.
-- ============================================

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
  -- Reapertura: deshacer una entrega marcada por error.
  OR (OLD.estado = 'entregado'  AND NEW.estado = 'listo')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transición de estado inválida: % → %', OLD.estado, NEW.estado;
END;
$$;

-- El trigger viene de T3, pero se re-declara para que esta migración sea
-- autocontenida: aplicada sobre una base fresca fuera de orden, sin esto la
-- validación de transiciones simplemente no correría.
DROP TRIGGER IF EXISTS trg_pedidos_transicion ON pedidos;
CREATE TRIGGER trg_pedidos_transicion
  BEFORE UPDATE OF estado ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_transicion_pedido();

-- VERIFICACION
-- UPDATE pedidos SET estado = 'listo' WHERE estado = 'entregado' AND id = '<uuid>';  -- debe pasar
-- UPDATE pedidos SET estado = 'nuevo' WHERE estado = 'entregado' AND id = '<uuid>';  -- debe fallar
