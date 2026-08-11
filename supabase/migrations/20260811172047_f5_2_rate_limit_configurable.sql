-- ============================================
-- GARZÓN DIGITAL — F5.2: rate-limit de pedidos configurable por local
--
-- Problema (auditoría 2026-08-10, hallazgo A1): `crear_pedido` tenía un tope
-- fijo de 15 pedidos por local por minuto. Son 1 cada 4 segundos: una apertura
-- de mediodía con 10 mesas confirmando a la vez ya consume dos tercios del
-- techo, y un local mediano lo revienta. El cliente legítimo veía "Demasiados
-- pedidos" delante del dueño.
--
-- Se sube el default a 40/min y se hace configurable por local. La columna NO
-- se agrega a los privilegios de UPDATE del staff (T4): es una perilla de
-- plataforma, no de branding, y queda al service-role.
--
-- Nota: esto sigue siendo una defensa contra ráfagas accidentales, no contra un
-- atacante decidido (que igual satura y de paso deja fuera a los clientes
-- buenos). La defensa real es un token de sesión/desafío en el checkout — queda
-- anotado para F8.
--
-- Idempotente.
-- ============================================

-- 1. Columna de configuración por local.
ALTER TABLE locales
  ADD COLUMN IF NOT EXISTS limite_pedidos_min int NOT NULL DEFAULT 40;

DO $$
BEGIN
  ALTER TABLE locales ADD CONSTRAINT locales_limite_pedidos_min_positivo
    CHECK (limite_pedidos_min > 0 AND limite_pedidos_min <= 500);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. crear_pedido v5 — idéntica a v4 salvo que el rate-limit se lee del local.
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
  v_limite int;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_total bigint := 0;
  v_pedido_id uuid;
  v_nombre_limpio text;
  v_numero int;
  v_recientes int;
  -- Items validados con su precio, leídos UNA sola vez.
  v_items_validados jsonb := '[]'::jsonb;
  v_precio_real int;
BEGIN
  -- Validar local y leer su límite en la misma pasada
  SELECT activo, COALESCE(limite_pedidos_min, 40)
    INTO v_local_activo, v_limite
    FROM locales WHERE id = p_local_id;
  IF v_local_activo IS NULL OR v_local_activo = false THEN
    RAISE EXCEPTION 'Local no disponible';
  END IF;

  -- Validar nombre
  v_nombre_limpio := trim(coalesce(p_nombre, ''));
  IF v_nombre_limpio = '' THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;
  IF length(v_nombre_limpio) > 80 THEN
    RAISE EXCEPTION 'Nombre demasiado largo';
  END IF;

  -- Topes de tamaño del pedido
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no puede estar vacío';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Demasiados productos distintos en un pedido (máx. 50)';
  END IF;
  IF length(coalesce(p_notas, '')) > 500 OR length(coalesce(p_mesa, '')) > 60 THEN
    RAISE EXCEPTION 'Texto demasiado largo';
  END IF;

  -- Validar items y calcular total leyendo precios UNA sola vez
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    IF v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad > 99 THEN
      RAISE EXCEPTION 'Cantidad inválida para el producto %', v_producto_id;
    END IF;
    IF length(coalesce(v_item->>'notas', '')) > 300 THEN
      RAISE EXCEPTION 'Nota de producto demasiado larga';
    END IF;

    SELECT precio INTO v_precio_real
    FROM productos
    WHERE id = v_producto_id AND local_id = p_local_id AND disponible = true;
    IF v_precio_real IS NULL THEN
      RAISE EXCEPTION 'Producto no disponible: %', v_producto_id;
    END IF;

    v_total := v_total + (v_cantidad::bigint * v_precio_real);
    v_items_validados := v_items_validados || jsonb_build_object(
      'producto_id', v_producto_id,
      'cantidad', v_cantidad,
      'precio_unitario', v_precio_real,
      'notas', NULLIF(trim(coalesce(v_item->>'notas', '')), '')
    );
  END LOOP;

  IF v_total > 10000000 THEN
    RAISE EXCEPTION 'El pedido excede el monto máximo permitido';
  END IF;

  -- Serializar por local (numeración) y aplicar rate-limit bajo el mismo lock
  PERFORM pg_advisory_xact_lock(hashtext(p_local_id::text));

  -- Rate-limit configurable por local (default 40/min).
  SELECT count(*) INTO v_recientes
  FROM pedidos
  WHERE local_id = p_local_id AND created_at > now() - interval '60 seconds';
  IF v_recientes >= v_limite THEN
    RAISE EXCEPTION 'Demasiados pedidos en este momento, intenta en un minuto';
  END IF;

  -- Número correlativo por local, reiniciado cada día (hora de Chile)
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
    v_total::int,
    NULLIF(trim(coalesce(p_notas, '')), '')
  )
  RETURNING id INTO v_pedido_id;

  -- Insertar items desde los datos YA validados (sin releer precios)
  INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, notas)
  SELECT
    v_pedido_id,
    (it->>'producto_id')::uuid,
    (it->>'cantidad')::int,
    (it->>'precio_unitario')::int,
    it->>'notas'
  FROM jsonb_array_elements(v_items_validados) AS it;

  RETURN v_pedido_id;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_pedido(uuid,text,text,text,jsonb) TO anon, authenticated;

-- VERIFICACION
-- SELECT slug, limite_pedidos_min FROM locales ORDER BY slug;
-- SELECT grantee, column_name FROM information_schema.column_privileges
--   WHERE table_name = 'locales' AND privilege_type = 'UPDATE';  -- limite_pedidos_min NO debe aparecer
