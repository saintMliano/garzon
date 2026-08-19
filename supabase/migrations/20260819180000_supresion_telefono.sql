-- ============================================
-- GARZÓN DIGITAL — Registro de supresiones de teléfono
--
-- Cuando un comensal ejerce su derecho de supresión, no basta con borrar: hay
-- que poder DEMOSTRAR que se borró, cuándo y sobre cuántos pedidos. Esa prueba
-- es lo que se le muestra a la persona que reclamó y, si algún día hace falta,
-- a la Agencia.
--
-- La trampa evidente sería guardar el teléfono en el registro "para saber a
-- quién le borramos". Eso anularía el borrado: el dato seguiría vivo, mudado de
-- tabla. Por eso acá solo queda **enmascarado** (`+56 9 ---- 5678`): alcanza
-- para reconciliar con el reclamo y no reconstruye el número.
--
-- Idempotente.
-- ============================================

CREATE TABLE IF NOT EXISTS supresiones_telefono (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = la supresión abarcó todos los locales.
  local_id           uuid REFERENCES locales(id) ON DELETE SET NULL,
  telefono_enmascarado text NOT NULL,
  pedidos_afectados  int NOT NULL,
  actor              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE supresiones_telefono IS
  'Bitácora de derechos de supresión ejercidos. El teléfono va enmascarado a propósito.';

DO $bloque$
BEGIN
  -- El número completo no puede volver a entrar por acá ni por descuido: la
  -- base lo rechaza si alguien intenta guardar algo con 9 dígitos seguidos.
  ALTER TABLE supresiones_telefono ADD CONSTRAINT supresiones_telefono_enmascarado
    CHECK (telefono_enmascarado !~ '[0-9]{5,}');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $bloque$;

-- RLS activada y SIN políticas: nadie con una sesión de navegador la lee ni la
-- escribe. Solo el service-role, que la salta, desde el endpoint server-only.
ALTER TABLE supresiones_telefono ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON supresiones_telefono FROM anon, authenticated;

-- ============================================
-- VERIFICACION
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'supresiones_telefono';
-- SELECT count(*) FROM pg_policies WHERE tablename = 'supresiones_telefono';  -- 0
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'supresiones_telefono';
