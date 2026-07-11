-- ============================================
-- GARZÓN DIGITAL — Consolidación T4: columnas protegidas de `locales`
-- y límites del bucket `menu`.
-- El staff solo puede actualizar las columnas de branding/operación de su
-- local; `slug`, `activo`, `id` y `created_at` quedan reservadas al
-- service-role. Idempotente.
-- ============================================

-- 1. Privilegios de columna en `locales` (la RLS de Fase 4.1 sigue
--    decidiendo QUÉ filas; esto decide QUÉ columnas).
REVOKE UPDATE ON locales FROM authenticated;
REVOKE UPDATE ON locales FROM anon;
GRANT UPDATE (nombre, slogan, direccion, telefono, logo_url,
              color_primario, color_acento, mesas)
  ON locales TO authenticated;

-- 2. Límites del bucket de imágenes: 3 MB y solo imágenes.
UPDATE storage.buckets
SET file_size_limit = 3145728,  -- 3 MB
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif']
WHERE id = 'menu';

-- VERIFICACION
-- SELECT grantee, column_name FROM information_schema.column_privileges
--   WHERE table_name = 'locales' AND privilege_type = 'UPDATE' ORDER BY column_name;
-- SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'menu';
