-- ============================================
-- GARZÓN DIGITAL — F10: propina sugerida + serie mensual de reportes
--
-- PROPINA — la plata NO pasa por la plataforma. El comensal elige un porcentaje
-- sugerido sobre el total; el local lo ve en la comanda y lo cobra en su caja,
-- con su boleta, como siempre. Acá solo se guarda la intención del cliente.
--
-- Dos decisiones que importan:
--
-- 1. `propina` va en su PROPIA columna y **no se suma a `total`**. La propina no
--    es venta del local, es del personal: mezclarla inflaría la "venta" de todos
--    los reportes de F6 con plata ajena.
--
-- 2. El cliente manda el **porcentaje**, no el monto. El servidor calcula la
--    propina sobre el total que él mismo acaba de computar. Mismo principio que
--    el resto del sistema: el navegador no decide plata.
--
-- Idempotente.
-- ============================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS propina int NOT NULL DEFAULT 0;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS propina_pct int NOT NULL DEFAULT 0;

DO $$
BEGIN
  -- Tope del 100%: una propina mayor que la cuenta es casi siempre un error de
  -- dedo, y en la caja genera una discusión incómoda.
  ALTER TABLE pedidos ADD CONSTRAINT pedidos_propina_valida
    CHECK (propina >= 0 AND propina_pct >= 0 AND propina_pct <= 100);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- El staff no puede tocar la propina (solo `estado`, desde T3). Queda como la
-- dejó el cliente.

-- ============================================
-- crear_pedido v7 — igual que v6 más el porcentaje de propina
-- ============================================
DROP FUNCTION IF EXISTS crear_pedido(uuid, text, text, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION crear_pedido(
  p_local_id uuid,
  p_nombre text,
  p_mesa text,
  p_notas text,
  p_items jsonb,
  p_client_request_id uuid DEFAULT NULL,
  p_propina_pct int DEFAULT 0
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
  v_propina_pct int;
  v_propina bigint;
BEGIN
  -- IDEMPOTENCIA (F8): si este intento de checkout ya produjo un pedido, se
  -- devuelve el mismo id.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existente FROM pedidos WHERE client_request_id = p_client_request_id;
    IF v_existente IS NOT NULL THEN
      RETURN v_existente;
    END IF;
  END IF;

  SELECT activo, COALESCE(limite_pedidos_min, 40)
    INTO v_local_activo, v_limite
    FROM locales WHERE id = p_local_id;
  IF v_local_activo IS NULL OR v_local_activo = false THEN
    RAISE EXCEPTION 'Local no disponible';
  END IF;

  v_nombre_limpio := trim(coalesce(p_nombre, ''));
  IF v_nombre_limpio = '' THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;
  IF length(v_nombre_limpio) > 80 THEN
    RAISE EXCEPTION 'Nombre demasiado largo';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no puede estar vacío';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Demasiados productos distintos en un pedido (máx. 50)';
  END IF;
  IF length(coalesce(p_notas, '')) > 500 OR length(coalesce(p_mesa, '')) > 60 THEN
    RAISE EXCEPTION 'Texto demasiado largo';
  END IF;

  -- Porcentaje de propina: se acota en vez de fallar. Que un pedido real se
  -- pierda por un porcentaje raro sería peor que cobrar una propina de 0.
  v_propina_pct := LEAST(GREATEST(COALESCE(p_propina_pct, 0), 0), 100);

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

  -- La propina se calcula sobre el total del SERVIDOR, no sobre lo que dijo el
  -- navegador. Se redondea a peso entero: en Chile no hay decimales.
  v_propina := round(v_total * v_propina_pct / 100.0);

  PERFORM pg_advisory_xact_lock(hashtext(p_local_id::text));

  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existente FROM pedidos WHERE client_request_id = p_client_request_id;
    IF v_existente IS NOT NULL THEN
      RETURN v_existente;
    END IF;
  END IF;

  SELECT count(*) INTO v_recientes
  FROM pedidos
  WHERE local_id = p_local_id AND created_at > now() - interval '60 seconds';
  IF v_recientes >= v_limite THEN
    RAISE EXCEPTION 'Demasiados pedidos en este momento, intenta en un minuto';
  END IF;

  SELECT COALESCE(MAX(numero_pedido), 0) + 1 INTO v_numero
  FROM pedidos
  WHERE local_id = p_local_id
    AND (created_at AT TIME ZONE 'America/Santiago')::date
        = (now() AT TIME ZONE 'America/Santiago')::date;

  INSERT INTO pedidos (
    local_id, numero_pedido, estado, nombre_cliente, mesa, total, notas,
    client_request_id, propina, propina_pct
  )
  VALUES (
    p_local_id,
    v_numero,
    'nuevo',
    v_nombre_limpio,
    NULLIF(trim(coalesce(p_mesa, '')), ''),
    v_total::int,
    NULLIF(trim(coalesce(p_notas, '')), ''),
    p_client_request_id,
    v_propina::int,
    v_propina_pct
  )
  RETURNING id INTO v_pedido_id;

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
  WHEN unique_violation THEN
    SELECT id INTO v_existente FROM pedidos WHERE client_request_id = p_client_request_id;
    IF v_existente IS NOT NULL THEN
      RETURN v_existente;
    END IF;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_pedido(uuid,text,text,text,jsonb,uuid,int) TO anon, authenticated;

-- ============================================
-- Reportes: propinas aparte, y serie mensual para los rangos largos
-- ============================================

-- `reporte_ventas` gana la propina como columna propia. Sigue SIN sumarla a
-- `venta_total`: son dos plata distintas y el dueño tiene que verlas separadas.
--
-- Hay que DROPear antes de recrear: Postgres no permite cambiar el tipo de
-- retorno de una función con CREATE OR REPLACE cuando cambian las columnas OUT
-- (SQLSTATE 42P13). Como la migración corre en una transacción, la función nunca
-- queda ausente para nadie.
DROP FUNCTION IF EXISTS reporte_ventas(uuid, date, date);

CREATE OR REPLACE FUNCTION reporte_ventas(
  p_local_id uuid,
  p_desde date,
  p_hasta date
) RETURNS TABLE (
  pedidos_total       int,
  pedidos_entregados  int,
  pedidos_pendientes  int,
  pedidos_cancelados  int,
  venta_entregada     bigint,
  venta_total         bigint,
  ticket_promedio     int,
  propinas_total      bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH rango AS (
    SELECT *
    FROM pedidos
    WHERE local_id = p_local_id
      AND created_at >= (p_desde::timestamp AT TIME ZONE 'America/Santiago')
      AND created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Santiago')
  )
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE estado = 'entregado')::int,
    count(*) FILTER (WHERE estado NOT IN ('entregado', 'cancelado'))::int,
    count(*) FILTER (WHERE estado = 'cancelado')::int,
    COALESCE(sum(total) FILTER (WHERE estado = 'entregado'), 0)::bigint,
    COALESCE(sum(total) FILTER (WHERE estado <> 'cancelado'), 0)::bigint,
    COALESCE(
      (COALESCE(sum(total) FILTER (WHERE estado <> 'cancelado'), 0)
       / NULLIF(count(*) FILTER (WHERE estado <> 'cancelado'), 0))::int,
      0
    ),
    COALESCE(sum(propina) FILTER (WHERE estado <> 'cancelado'), 0)::bigint
  FROM rango;
$$;

-- El DROP se lleva los permisos, así que hay que volver a otorgarlos.
REVOKE ALL ON FUNCTION reporte_ventas(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reporte_ventas(uuid,date,date) TO authenticated;

-- Serie mensual: el gráfico diario es ilegible para un año.
CREATE OR REPLACE FUNCTION reporte_ventas_por_mes(
  p_local_id uuid,
  p_desde date,
  p_hasta date
) RETURNS TABLE (
  mes     date,   -- primer día del mes, en hora de Chile
  pedidos int,
  venta   bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    date_trunc('month', (created_at AT TIME ZONE 'America/Santiago'))::date AS mes,
    count(*)::int,
    COALESCE(sum(total), 0)::bigint
  FROM pedidos
  WHERE local_id = p_local_id
    AND estado <> 'cancelado'
    AND created_at >= (p_desde::timestamp AT TIME ZONE 'America/Santiago')
    AND created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Santiago')
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION reporte_ventas_por_mes(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reporte_ventas_por_mes(uuid,date,date) TO authenticated;

-- VERIFICACION
-- SELECT propina, propina_pct, total FROM pedidos WHERE propina > 0 LIMIT 5;
-- SELECT * FROM reporte_ventas_por_mes('<local_id>', '2026-01-01', current_date);
