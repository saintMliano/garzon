-- ============================================
-- GARZÓN DIGITAL — Fase 4.1: Permisos de escritura para gestión de menú
-- Hasta ahora categorias/productos/locales eran SOLO LECTURA pública.
-- Se agregan políticas de escritura para el STAFF autenticado, scopeadas
-- por local_staff (mismo patrón que pedidos en Fase 0).
-- La lectura pública del menú se mantiene intacta.
-- Idempotente.
-- ============================================

-- ---- CATEGORIAS: insert / update / delete por staff del local ----
DROP POLICY IF EXISTS "Staff insert categorias" ON categorias;
CREATE POLICY "Staff insert categorias" ON categorias
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = categorias.local_id));

DROP POLICY IF EXISTS "Staff update categorias" ON categorias;
CREATE POLICY "Staff update categorias" ON categorias
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = categorias.local_id))
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = categorias.local_id));

DROP POLICY IF EXISTS "Staff delete categorias" ON categorias;
CREATE POLICY "Staff delete categorias" ON categorias
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = categorias.local_id));

-- ---- PRODUCTOS: insert / update / delete por staff del local ----
DROP POLICY IF EXISTS "Staff insert productos" ON productos;
CREATE POLICY "Staff insert productos" ON productos
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = productos.local_id));

DROP POLICY IF EXISTS "Staff update productos" ON productos;
CREATE POLICY "Staff update productos" ON productos
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = productos.local_id))
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = productos.local_id));

DROP POLICY IF EXISTS "Staff delete productos" ON productos;
CREATE POLICY "Staff delete productos" ON productos
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = productos.local_id));

-- ---- LOCALES: el staff puede actualizar SU local (branding, mesas, etc.) ----
DROP POLICY IF EXISTS "Staff update locales" ON locales;
CREATE POLICY "Staff update locales" ON locales
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = locales.id))
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = locales.id));

-- ---- Quick win (Fase 4.5 adelantado): índice para la ruta caliente del menú ----
CREATE INDEX IF NOT EXISTS idx_categorias_local ON categorias(local_id);

-- VERIFICACION
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('categorias','productos','locales') ORDER BY tablename, cmd;
