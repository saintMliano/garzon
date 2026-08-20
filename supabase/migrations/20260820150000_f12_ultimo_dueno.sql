-- ============================================
-- GARZÓN DIGITAL — F12.2: un local nunca se queda sin dueño
--
-- El caso real: el dueño se degrada a sí mismo para "ver cómo lo ve su
-- garzón". A partir de ahí nadie puede editar el menú ni volver a ascenderlo,
-- y arreglarlo requiere SQL sobre la cuenta de un cliente.
--
-- La guarda vive también en /api/local/equipo, pero un endpoint solo protege el
-- camino que pasa por él. Esto protege todos, incluido un UPDATE a mano.
--
-- Idempotente.
-- ============================================

CREATE OR REPLACE FUNCTION local_staff_exigir_dueno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_id uuid := COALESCE(OLD.local_id, NEW.local_id);
  v_duenos int;
BEGIN
  -- Si el local ya no existe, esto es el borrado en cascada de un local
  -- completo y no hay invariante que defender. Sin esta salida, no se podría
  -- borrar un local nunca más.
  IF NOT EXISTS (SELECT 1 FROM locales WHERE id = v_local_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO v_duenos
  FROM local_staff
  WHERE local_id = v_local_id AND rol = 'dueño';

  IF v_duenos = 0 THEN
    RAISE EXCEPTION 'El local se quedaría sin ningún dueño';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- AFTER y no BEFORE: la cuenta tiene que hacerse sobre el estado ya cambiado.
DROP TRIGGER IF EXISTS trg_local_staff_exigir_dueno ON local_staff;
CREATE TRIGGER trg_local_staff_exigir_dueno
  AFTER UPDATE OR DELETE ON local_staff
  FOR EACH ROW
  EXECUTE FUNCTION local_staff_exigir_dueno();

-- VERIFICACION
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'local_staff'::regclass AND NOT tgisinternal;
