-- ============================================
-- GARZÓN DIGITAL — Fase 4.3: Identidad visual del local (white-label)
-- color_primario y logo_url ya existen en `locales`. Se agrega un slogan
-- opcional para el encabezado del menú. Idempotente.
-- La escritura de `locales` por el staff ya está habilitada (Fase 4.1).
-- ============================================

ALTER TABLE locales ADD COLUMN IF NOT EXISTS slogan text;

-- Semilla para que el local demo se vea completo.
UPDATE locales
  SET slogan = 'Sabor de barrio, hecho al momento'
  WHERE slug = 'el-lalo' AND slogan IS NULL;

-- VERIFICACION
-- SELECT slug, nombre, slogan, color_primario, logo_url FROM locales;
