-- ============================================
-- GARZÓN DIGITAL — F8: idempotencia de `crear_pedido` (hallazgo A2)
--
-- El escenario, que en 4G dentro de un local pasa de verdad: la RPC se ejecuta y
-- COMMITEA, pero la respuesta se pierde en el camino de vuelta. El cliente ve un
-- error, el carrito no se limpió, y toca "Enviar pedido" otra vez. La cocina
-- recibe dos pedidos idénticos y cocina los dos.
--
-- Se agrega `client_request_id`: el navegador genera un UUID por intento de
-- checkout y lo manda en cada reintento. Si ya existe un pedido con ese id, la
-- función devuelve ESE pedido en vez de crear otro.
--
-- Índice único PARCIAL (`WHERE ... IS NOT NULL`): los 9 pedidos históricos no
-- tienen id y no deben chocar entre sí.
--
-- La firma cambia (un parámetro más), así que se BORRA la versión de 5
-- argumentos: dejar las dos vivas significaría que un cliente puede seguir
-- llamando la variante sin protección. El parámetro nuevo tiene DEFAULT NULL,
-- así que un front todavía no actualizado sigue funcionando (sin idempotencia).
--
-- Idempotente.
-- ============================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_client_request
  ON pedidos(client_request_id)
  WHERE client_request_id IS NOT NULL;

DROP FUNCTION IF EXISTS crear_pedido(uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION crear_pedido(
  p_local_id uuid,
  p_nombre text,
  p_mesa text,
  p_notas text,
  p_items jsonb,
  p_client_request_id uuid DEFAULT NULL
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
  v_items_validados jsonb := '[]'::jsonb;
  v_precio_real int;
  v_existente uuid;
BEGIN
  -- IDEMPOTENCIA — antes que nada: si este intento de checkout ya produjo un
  -- pedido, se devuelve el mismo id. Un reintento no cuenta para el rate-limit
  -- ni consume un número de pedido nuevo.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existente FROM pedidos WHERE client_request_id = p_client_request_id;
    IF v_existente IS NOT NULL THEN
      RETURN v_existente;
    END IF;
  END IF;

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

  -- Dentro del lock, volver a mirar: dos reintentos simultáneos del mismo
  -- checkout pueden haber pasado juntos la comprobación de arriba.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existente FROM pedidos WHERE client_request_id = p_client_request_id;
    IF v_existente IS NOT NULL THEN
      RETURN v_existente;
    END IF;
  END IF;

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

  INSERT INTO pedidos (local_id, numero_pedido, estado, nombre_cliente, mesa, total, notas, client_request_id)
  VALUES (
    p_local_id,
    v_numero,
    'nuevo',
    v_nombre_limpio,
    NULLIF(trim(coalesce(p_mesa, '')), ''),
    v_total::int,
    NULLIF(trim(coalesce(p_notas, '')), ''),
    p_client_request_id
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

EXCEPTION
  -- Última red: si dos transacciones concurrentes llegaron igual al INSERT, el
  -- índice único decide y el perdedor devuelve el pedido del ganador en vez de
  -- reventar con un error críptico en la cara del comensal.
  WHEN unique_violation THEN
    SELECT id INTO v_existente FROM pedidos WHERE client_request_id = p_client_request_id;
    IF v_existente IS NOT NULL THEN
      RETURN v_existente;
    END IF;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_pedido(uuid,text,text,text,jsonb,uuid) TO anon, authenticated;

-- VERIFICACION
-- SELECT crear_pedido('<local>','Test','Mesa 1','', '[...]'::jsonb, '<uuid>');  -- dos veces
--   → debe devolver el MISMO id y crear un solo pedido.
