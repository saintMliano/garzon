-- ============================================
-- GARZÓN DIGITAL — F7: cerrar la enumeración pública (hallazgo M1)
--
-- Hasta ahora `locales`, `categorias` y `productos` tenían lectura pública sin
-- filtro: con la anon key —que viaja en el bundle de cualquier navegador—
-- alcanzaba un `select * from locales` para llevarse la **cartera completa de
-- clientes de la plataforma**, incluidos los que todavía no salieron al aire.
--
-- Ya no hace falta: desde F7 el menú público se sirve por `get_menu_publico`,
-- una función SECURITY DEFINER que exige **saber el slug** y solo devuelve las
-- columnas necesarias.
--
-- ⚠️ CUIDADO QUE CASI SE PASA POR ALTO:
--    El dashboard del staff leía esas tres tablas apoyándose en las MISMAS
--    políticas públicas — nunca hubo una política de SELECT para `authenticated`
--    (fase4-1 agregó INSERT/UPDATE/DELETE, pero no SELECT). Quitar la lectura
--    pública sin más habría roto el editor de menú, el de identidad, el selector
--    de local y los nombres de producto en los reportes.
--    Por eso primero se AGREGAN las políticas de staff y después se quitan las
--    públicas. La migración corre en una transacción: o queda todo o no queda nada.
--
-- Idempotente.
-- ============================================

-- ============================================
-- 1. Lectura para el staff autenticado (lo que antes daba la política pública)
-- ============================================

DROP POLICY IF EXISTS "Staff read locales" ON locales;
CREATE POLICY "Staff read locales" ON locales
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM local_staff s
    WHERE s.user_id = auth.uid() AND s.local_id = locales.id
  ));

DROP POLICY IF EXISTS "Staff read categorias" ON categorias;
CREATE POLICY "Staff read categorias" ON categorias
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM local_staff s
    WHERE s.user_id = auth.uid() AND s.local_id = categorias.local_id
  ));

DROP POLICY IF EXISTS "Staff read productos" ON productos;
CREATE POLICY "Staff read productos" ON productos
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM local_staff s
    WHERE s.user_id = auth.uid() AND s.local_id = productos.local_id
  ));

-- ============================================
-- 2. Recién ahora: quitar la lectura pública
-- ============================================

DROP POLICY IF EXISTS "Public read locales" ON locales;
DROP POLICY IF EXISTS "Public read categorias" ON categorias;
DROP POLICY IF EXISTS "Public read productos" ON productos;

-- El menú público ya no depende de estas tablas directamente: pasa por
-- `get_menu_publico(slug)`, que es SECURITY DEFINER y no ve afectada su lectura.

-- VERIFICACION
-- Con la anon key:      select * from locales;                  -- debe devolver 0 filas
-- Con la anon key:      select get_menu_publico('el-lalo');     -- debe seguir funcionando
-- Con sesión de staff:  select * from locales;                  -- solo su local
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
--   WHERE tablename IN ('locales','categorias','productos') ORDER BY tablename, cmd;
