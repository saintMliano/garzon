-- ============================================
-- GARZÓN DIGITAL — Fase 4.4.a: Rol de super-admin de la plataforma
-- Tabla que marca quién puede dar de alta locales nuevos. El endpoint
-- /api/admin/onboard verifica que auth.uid() esté aquí antes de operar.
-- Idempotente. La membresía se administra por SQL / service-role.
-- ============================================

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Cada usuario puede leer SOLO su propia fila (para verificar si es admin).
-- Sin políticas de INSERT/UPDATE/DELETE públicas: se administra por service-role.
DROP POLICY IF EXISTS "read own admin row" ON platform_admins;
CREATE POLICY "read own admin row" ON platform_admins
  FOR SELECT
  USING (user_id = auth.uid());

-- VERIFICACION
-- SELECT u.email FROM platform_admins pa JOIN auth.users u ON u.id = pa.user_id;
