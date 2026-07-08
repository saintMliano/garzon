-- ============================================
-- GARZÓN DIGITAL — Fase 3: Multi-tenant real
-- Numeración de pedidos POR LOCAL (reinicia por día), mesas configurables
-- por local, e imágenes de productos movidas a datos (imagen_url).
-- Idempotente.
-- ============================================

-- 1. Numeración por local: dejar de usar el SERIAL global.
--    (El valor lo calcula la RPC crear_pedido bajo advisory lock.)
ALTER TABLE pedidos ALTER COLUMN numero_pedido DROP DEFAULT;

-- 2. Mesas configurables por local (array de etiquetas).
--    ADD COLUMN con DEFAULT rellena las filas existentes con el set actual.
ALTER TABLE locales ADD COLUMN IF NOT EXISTS mesas text[]
  DEFAULT ARRAY['Mesa 1','Mesa 2','Mesa 3','Mesa 4','Mesa 5','Mesa 6','Barra','Para llevar'];

-- 3. Imágenes del tenant demo en datos (elimina la dependencia de
--    FALLBACK_IMAGES en el código; los archivos siguen en /public/food).
UPDATE productos p SET imagen_url = m.url
FROM (VALUES
  ('Barros Luco','/food/barros-luco.png'),
  ('Barros Jarpa','/food/barros-luco.png'),
  ('Chacarero','/food/chacarero.png'),
  ('Lomito','/food/lomito.png'),
  ('Churrasco','/food/barros-luco.png'),
  ('Ave Mayo','/food/ave-palta.png'),
  ('Ave Palta','/food/ave-palta.png'),
  ('Completo','/food/completo.png'),
  ('Italiano','/food/italiano.png'),
  ('Dinámico','/food/completo.png'),
  ('AS Completo','/food/italiano.png'),
  ('Papas Fritas Porción','/food/papas-fritas.png'),
  ('Papas Fritas Familiar','/food/papas-fritas.png'),
  ('Papas con Cheddar','/food/papas-cheddar.png'),
  ('Coca-Cola 350ml','/food/coca-cola.png'),
  ('Coca-Cola 1.5L','/food/coca-cola.png'),
  ('Sprite 350ml','/food/coca-cola.png'),
  ('Fanta 350ml','/food/coca-cola.png'),
  ('Agua Mineral 600ml','/food/jugo-natural.png'),
  ('Jugo Natural','/food/jugo-natural.png')
) AS m(nombre, url)
WHERE p.nombre = m.nombre
  AND p.local_id = (SELECT id FROM locales WHERE slug = 'el-lalo')
  AND p.imagen_url IS NULL;

-- 4. crear_pedido v3: igual que antes (total en servidor, atómico, valida
--    disponibilidad) + numeración por local reiniciada por día (hora Chile),
--    serializada por local con advisory lock para evitar colisiones.
CREATE OR REPLACE FUNCTION crear_pedido(
  p_local_id uuid,
  p_nombre text,
  p_mesa text,
  p_notas text,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_activo boolean;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_item_notas text;
  v_precio_real int;
  v_total int := 0;
  v_pedido_id uuid;
  v_nombre_limpio text;
  v_numero int;
BEGIN
  SELECT activo INTO v_local_activo FROM locales WHERE id = p_local_id;
  IF v_local_activo IS NULL OR v_local_activo = false THEN
    RAISE EXCEPTION 'Local no disponible';
  END IF;

  v_nombre_limpio := trim(coalesce(p_nombre, ''));
  IF v_nombre_limpio = '' THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no puede estar vacío';
  END IF;

  -- Validar y calcular total con precios reales del servidor
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para el producto %', v_producto_id;
    END IF;
    SELECT precio INTO v_precio_real
    FROM productos
    WHERE id = v_producto_id AND local_id = p_local_id AND disponible = true;
    IF v_precio_real IS NULL THEN
      RAISE EXCEPTION 'Producto no disponible: %', v_producto_id;
    END IF;
    v_total := v_total + (v_cantidad * v_precio_real);
  END LOOP;

  -- Número correlativo por local, reiniciado cada día (zona de Chile).
  -- El advisory lock serializa la asignación por local dentro de la transacción.
  PERFORM pg_advisory_xact_lock(hashtext(p_local_id::text));
  SELECT COALESCE(MAX(numero_pedido), 0) + 1 INTO v_numero
  FROM pedidos
  WHERE local_id = p_local_id
    AND (created_at AT TIME ZONE 'America/Santiago')::date
        = (now() AT TIME ZONE 'America/Santiago')::date;

  INSERT INTO pedidos (local_id, numero_pedido, estado, nombre_cliente, mesa, total, notas)
  VALUES (
    p_local_id,
    v_numero,
    'nuevo',
    v_nombre_limpio,
    NULLIF(trim(coalesce(p_mesa, '')), ''),
    v_total,
    NULLIF(trim(coalesce(p_notas, '')), '')
  )
  RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_item_notas := NULLIF(trim(coalesce(v_item->>'notas', '')), '');
    SELECT precio INTO v_precio_real
    FROM productos
    WHERE id = v_producto_id AND local_id = p_local_id AND disponible = true;
    INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, notas)
    VALUES (v_pedido_id, v_producto_id, v_cantidad, v_precio_real, v_item_notas);
  END LOOP;

  RETURN v_pedido_id;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_pedido(uuid,text,text,text,jsonb) TO anon, authenticated;

-- VERIFICACION
-- SELECT slug, mesas FROM locales;
-- SELECT nombre, imagen_url FROM productos WHERE local_id = (SELECT id FROM locales WHERE slug='el-lalo') ORDER BY orden;
