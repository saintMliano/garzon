-- ============================================
-- GARZÓN DIGITAL — F8: auditoría de cambios de estado
--
-- Por qué hace falta: `pedidos.updated_at` era la única huella temporal, y dejó
-- de ser confiable cuando F5 habilitó reabrir una entrega — el ciclo
-- `entregado → listo → entregado` lo reescribe. Además nunca respondió "¿quién
-- canceló este pedido?", que en un local con varios turnos importa.
--
-- Cada transición queda registrada con su autor y su momento. De acá salen los
-- tiempos reales de cocina (aceptar → preparar → entregar), que es la métrica
-- con la que se le prueba al dueño que el sistema sirve.
--
-- Idempotente.
-- ============================================

-- ============================================
-- 1. Tabla de eventos
-- ============================================
CREATE TABLE IF NOT EXISTS pedido_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  local_id uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  estado_anterior text,               -- NULL en la creación del pedido
  estado_nuevo text NOT NULL,
  actor uuid,                         -- auth.uid(); NULL si lo creó el cliente anónimo
  created_at timestamptz NOT NULL DEFAULT now()
);

-- `local_id` se guarda desnormalizado a propósito: la RLS y los reportes filtran
-- por local, y así no hay que unir con `pedidos` en cada lectura.
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido ON pedido_eventos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_local_created ON pedido_eventos(local_id, created_at);

ALTER TABLE pedido_eventos ENABLE ROW LEVEL SECURITY;

-- Solo lectura, y solo del propio local. Nadie escribe a mano: escribe el
-- trigger. Sin políticas de INSERT/UPDATE/DELETE, la bitácora no se puede
-- adulterar desde la aplicación.
DROP POLICY IF EXISTS "Staff read pedido_eventos" ON pedido_eventos;
CREATE POLICY "Staff read pedido_eventos" ON pedido_eventos
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM local_staff s
    WHERE s.user_id = auth.uid() AND s.local_id = pedido_eventos.local_id
  ));

-- ============================================
-- 2. Trigger que la alimenta
-- ============================================
CREATE OR REPLACE FUNCTION public.registrar_evento_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER               -- el staff no tiene INSERT sobre pedido_eventos
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pedido_eventos (pedido_id, local_id, estado_anterior, estado_nuevo, actor)
    VALUES (NEW.id, NEW.local_id, NULL, NEW.estado, auth.uid());
    RETURN NEW;
  END IF;

  -- Solo interesan los cambios de estado reales.
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO pedido_eventos (pedido_id, local_id, estado_anterior, estado_nuevo, actor)
    VALUES (NEW.id, NEW.local_id, OLD.estado, NEW.estado, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_auditoria_insert ON pedidos;
CREATE TRIGGER trg_pedidos_auditoria_insert
  AFTER INSERT ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_evento_pedido();

DROP TRIGGER IF EXISTS trg_pedidos_auditoria_update ON pedidos;
CREATE TRIGGER trg_pedidos_auditoria_update
  AFTER UPDATE OF estado ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_evento_pedido();

-- ============================================
-- 3. Tiempos reales de cocina, a partir de la bitácora
-- ============================================
-- SECURITY INVOKER (default), igual que el resto de los `reporte_*`: la RLS de
-- `pedido_eventos` hace el aislamiento por local sola.
CREATE OR REPLACE FUNCTION reporte_tiempos(
  p_local_id uuid,
  p_desde date,
  p_hasta date
) RETURNS TABLE (
  pedidos_medidos      int,
  seg_hasta_aceptado   int,
  seg_hasta_listo      int,
  seg_hasta_entregado  int
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH hitos AS (
    SELECT
      e.pedido_id,
      min(e.created_at) FILTER (WHERE e.estado_nuevo = 'nuevo')      AS t_nuevo,
      min(e.created_at) FILTER (WHERE e.estado_nuevo = 'aceptado')   AS t_aceptado,
      min(e.created_at) FILTER (WHERE e.estado_nuevo = 'listo')      AS t_listo,
      min(e.created_at) FILTER (WHERE e.estado_nuevo = 'entregado')  AS t_entregado
    FROM pedido_eventos e
    WHERE e.local_id = p_local_id
      AND e.created_at >= (p_desde::timestamp AT TIME ZONE 'America/Santiago')
      AND e.created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Santiago')
    GROUP BY e.pedido_id
  )
  SELECT
    count(*) FILTER (WHERE t_nuevo IS NOT NULL)::int,
    -- Medianas y no promedios: un pedido olvidado media hora en la pantalla
    -- distorsiona un promedio y hace inservible la métrica.
    COALESCE(percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (t_aceptado - t_nuevo))
    ), 0)::int,
    COALESCE(percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (t_listo - t_nuevo))
    ), 0)::int,
    COALESCE(percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (t_entregado - t_nuevo))
    ), 0)::int
  FROM hitos;
$$;

REVOKE ALL ON FUNCTION reporte_tiempos(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reporte_tiempos(uuid,date,date) TO authenticated;

-- VERIFICACION
-- SELECT * FROM pedido_eventos ORDER BY created_at DESC LIMIT 10;
-- SELECT * FROM reporte_tiempos('<local_id>', current_date, current_date);
