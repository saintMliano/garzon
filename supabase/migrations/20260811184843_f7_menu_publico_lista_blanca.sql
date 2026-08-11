-- ============================================
-- GARZÓN DIGITAL — F7: `get_menu_publico` con lista BLANCA de columnas
--
-- La primera versión armaba el objeto con `to_jsonb(l) - 'activo'`, es decir una
-- lista NEGRA: publicaba todas las columnas de `locales` menos una. Eso hace que
-- cualquier columna futura viaje al público **por omisión**, que es exactamente
-- al revés de como debe fallar una decisión de exposición de datos.
--
-- Ya estaba pasando: `limite_pedidos_min` (F5) es una perilla de plataforma y se
-- estaba enviando al navegador de cada comensal.
--
-- Ahora se enumeran explícitamente las columnas que el menú necesita. Agregar una
-- columna a `locales` ya no la expone; hay que venir acá a decidirlo.
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
    'local', jsonb_build_object(
      'id',             l.id,
      'slug',           l.slug,
      'nombre',         l.nombre,
      'direccion',      l.direccion,
      'telefono',       l.telefono,
      'logo_url',       l.logo_url,
      'slogan',         l.slogan,
      'color_primario', l.color_primario,
      'color_acento',   l.color_acento,
      'mesas',          l.mesas
    ),
    'categorias', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'id', c.id, 'local_id', c.local_id, 'nombre', c.nombre,
         'icono', c.icono, 'orden', c.orden
       ) ORDER BY c.orden NULLS LAST, c.nombre)
       FROM categorias c WHERE c.local_id = l.id),
      '[]'::jsonb
    ),
    'productos', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'id', p.id, 'local_id', p.local_id, 'categoria_id', p.categoria_id,
         'nombre', p.nombre, 'descripcion', p.descripcion, 'precio', p.precio,
         'imagen_url', p.imagen_url, 'disponible', p.disponible, 'orden', p.orden
       ) ORDER BY p.orden NULLS LAST, p.nombre)
       FROM productos p WHERE p.local_id = l.id AND p.disponible = true),
      '[]'::jsonb
    )
  )
  FROM locales l
  WHERE l.slug = p_slug AND l.activo = true;
$$;

GRANT EXECUTE ON FUNCTION get_menu_publico(text) TO anon, authenticated;

-- VERIFICACION
-- SELECT get_menu_publico('el-lalo') -> 'local' ? 'limite_pedidos_min';  -- debe ser false
-- SELECT get_menu_publico('el-lalo') -> 'local' ? 'activo';              -- debe ser false
