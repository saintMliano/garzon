-- ============================================
-- GARZÓN DIGITAL — Fase 4.3.1: Color de acento configurable por el dueño
-- Segundo color de marca (además de color_primario) para precios y realces
-- secundarios. Default naranja para conservar la apariencia actual.
-- ADD COLUMN con DEFAULT rellena las filas existentes. Idempotente.
-- ============================================

ALTER TABLE locales ADD COLUMN IF NOT EXISTS color_acento text DEFAULT '#f97316';

-- VERIFICACION
-- SELECT slug, color_primario, color_acento FROM locales;
