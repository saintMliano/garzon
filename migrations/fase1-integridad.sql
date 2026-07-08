-- ============================================
-- GARZÓN DIGITAL — Fase 1: Integridad de datos
-- NOT NULL en las FK que el código asume siempre presentes.
-- (Los CHECK de precio/total/cantidad ya se agregaron en Fase 0.)
-- Idempotente: SET NOT NULL sobre una columna ya NOT NULL es no-op.
-- NOTA: NO se tocan las FK con ON DELETE SET NULL, que deben seguir
--       siendo nullable (productos.categoria_id, pedido_items.producto_id).
-- ============================================

DO $$
DECLARE
  v_nulls int;
BEGIN
  -- Verificar que no existan filas con FK nula antes de imponer NOT NULL.
  SELECT
    (SELECT count(*) FROM categorias   WHERE local_id  IS NULL) +
    (SELECT count(*) FROM productos     WHERE local_id  IS NULL) +
    (SELECT count(*) FROM pedidos       WHERE local_id  IS NULL) +
    (SELECT count(*) FROM pedido_items  WHERE pedido_id IS NULL)
  INTO v_nulls;

  IF v_nulls > 0 THEN
    RAISE EXCEPTION 'Hay % filas con FK nula; corrígelas antes de aplicar NOT NULL', v_nulls;
  END IF;

  ALTER TABLE categorias    ALTER COLUMN local_id  SET NOT NULL;
  ALTER TABLE productos      ALTER COLUMN local_id  SET NOT NULL;
  ALTER TABLE pedidos        ALTER COLUMN local_id  SET NOT NULL;
  ALTER TABLE pedido_items   ALTER COLUMN pedido_id SET NOT NULL;

  RAISE NOTICE 'NOT NULL aplicado a categorias.local_id, productos.local_id, pedidos.local_id, pedido_items.pedido_id';
END $$;

-- VERIFICACION
-- SELECT table_name, column_name, is_nullable FROM information_schema.columns
--   WHERE (table_name='categorias' AND column_name='local_id')
--      OR (table_name='productos' AND column_name='local_id')
--      OR (table_name='pedidos' AND column_name='local_id')
--      OR (table_name='pedido_items' AND column_name='pedido_id');
