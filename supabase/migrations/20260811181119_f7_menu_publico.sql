-- ============================================
-- GARZÓN DIGITAL — F7: menú público en una sola consulta
--
-- Problema medido (auditoría 2026-08-10): hasta ahora el menú se armaba en DOS
-- oleadas secuenciales desde el navegador — primero `locales` por slug, y recién
-- con el id a la vista `categorias` + `productos`. Medido desde fibra: p50 739 ms
-- solo de consultas para catirekaffe (59 productos). En un celular con 4G dentro
-- de un local con muros, sumando bundle e hidratación, son 3-6 s hasta ver la
-- carta — justo cuando el comensal tiene al garzón mirándolo.
--
-- Esta función devuelve local + categorías + productos disponibles en UN viaje.
-- Llamada desde un Server Component, viaja dentro del HTML.
--
-- SECURITY DEFINER a propósito, y acá sí hace falta (a diferencia de los
-- reportes de F6): habilita quitarle a `anon` la lectura directa de `locales`,
-- `categorias` y `productos`. Hoy cualquiera con la anon key puede hacer
-- `select * from locales` y llevarse la cartera completa de clientes de la
-- plataforma. Con esta función, para ver un menú hay que **saber el slug**.
--
-- Solo expone locales `activo = true` y productos `disponible = true`: es
-- exactamente lo que el menú público ya mostraba, ni un campo más.
--
-- Idempotente.
-- ============================================

CREATE OR REPLACE FUNCTION get_menu_publico(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'local', to_jsonb(l) - 'activo',
    'categorias', COALESCE(
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.orden NULLS LAST, c.nombre)
       FROM categorias c WHERE c.local_id = l.id),
      '[]'::jsonb
    ),
    'productos', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.orden NULLS LAST, p.nombre)
       FROM productos p WHERE p.local_id = l.id AND p.disponible = true),
      '[]'::jsonb
    )
  )
  FROM locales l
  WHERE l.slug = p_slug AND l.activo = true;
$$;

-- Devuelve NULL si el slug no existe o el local está inactivo: el cliente
-- muestra "Local no encontrado", igual que antes.

GRANT EXECUTE ON FUNCTION get_menu_publico(text) TO anon, authenticated;

-- Índice del filtro exacto que usa la función.
CREATE UNIQUE INDEX IF NOT EXISTS idx_locales_slug ON locales(slug);
CREATE INDEX IF NOT EXISTS idx_productos_local_disponible ON productos(local_id, disponible);

-- VERIFICACION
-- SELECT jsonb_pretty(get_menu_publico('el-lalo'));
-- SELECT get_menu_publico('no-existe') IS NULL;  -- debe ser true
