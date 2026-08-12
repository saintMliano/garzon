-- ============================================
-- GARZÓN DIGITAL — F10: suscripción por local
--
-- La plata NO pasa por la plataforma (decisión del dueño): el local paga por
-- transferencia y el super-admin registra hasta cuándo está al día. Acá no hay
-- pasarela de pago ni boletas; solo el estado de la cuenta.
--
-- LA REGLA, decidida por el dueño del producto:
--   aviso 7 días antes → vence → 7 días de GRACIA → recién ahí se pausan los
--   pedidos nuevos. La carta sigue visible y el dashboard, el historial y los
--   reportes NUNCA se bloquean: esos datos son del local, no nuestros.
--
-- CÓMO FALLA: hacia abierto. Un local sin fecha registrada se considera al día.
-- Pausar por error a un local que sí pagó, un viernes a las 21:00 con mesas
-- ocupadas, cuesta mucho más caro que regalarle unos días a uno que no pagó.
--
-- Idempotente.
-- ============================================

-- ============================================
-- 1. Columnas
-- ============================================

-- El plan es uno solo ('pro'), pero queda nombrado: el día que haya un segundo,
-- la columna ya existe y no hay que migrar filas en producción.
ALTER TABLE locales ADD COLUMN IF NOT EXISTS plan text;
ALTER TABLE locales ADD COLUMN IF NOT EXISTS suscripcion_estado text;
ALTER TABLE locales ADD COLUMN IF NOT EXISTS suscripcion_hasta date;
ALTER TABLE locales ADD COLUMN IF NOT EXISTS suscripcion_notas text;

COMMENT ON COLUMN locales.suscripcion_estado IS
  'Estado administrativo: prueba | activa | cortesia | cancelada. Lo fija el super-admin.';
COMMENT ON COLUMN locales.suscripcion_hasta IS
  'Hasta cuándo está pagado (o hasta cuándo dura la prueba). NULL = sin vencimiento.';
COMMENT ON COLUMN locales.suscripcion_notas IS
  'Notas de cobranza del super-admin (cómo paga, contacto). No se expone al público.';

-- Los locales que ya existían pasan a CORTESÍA, no a prueba: son el demo y el
-- primer cliente. Una migración jamás debe empezar a contarle los días a un
-- local que ya está andando.
-- Solo toca filas que quedaron en NULL, así que volver a correrla no reinicia
-- la suscripción de nadie.
UPDATE locales SET suscripcion_estado = 'cortesia' WHERE suscripcion_estado IS NULL;
UPDATE locales SET plan = 'pro' WHERE plan IS NULL;

ALTER TABLE locales ALTER COLUMN plan SET DEFAULT 'pro';
ALTER TABLE locales ALTER COLUMN plan SET NOT NULL;
ALTER TABLE locales ALTER COLUMN suscripcion_estado SET DEFAULT 'prueba';
ALTER TABLE locales ALTER COLUMN suscripcion_estado SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE locales ADD CONSTRAINT locales_suscripcion_estado_valido
    CHECK (suscripcion_estado IN ('prueba', 'activa', 'cortesia', 'cancelada'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. La regla, en un solo lugar
--
-- `crear_pedido`, el menú público y el dashboard tienen que coincidir en si un
-- local está pausado. Si cada uno repitiera la aritmética de fechas, tarde o
-- temprano uno cortaría pedidos mientras otro mostraría "todo bien".
-- ============================================

CREATE OR REPLACE FUNCTION situacion_suscripcion(p_estado text, p_hasta date)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    -- Cortesía: el demo y los pilotos regalados. Nunca se pausan.
    WHEN p_estado = 'cortesia' THEN 'cortesia'
    WHEN p_estado = 'cancelada' THEN 'pausada'
    -- Sin fecha registrada se falla hacia abierto (ver cabecera).
    WHEN p_hasta IS NULL THEN 'al_dia'
    WHEN p_hasta - (now() AT TIME ZONE 'America/Santiago')::date > 7 THEN 'al_dia'
    WHEN p_hasta - (now() AT TIME ZONE 'America/Santiago')::date >= 0 THEN 'por_vencer'
    -- Vencida pero dentro de los 7 días de gracia: avisa fuerte, no corta.
    WHEN (now() AT TIME ZONE 'America/Santiago')::date - p_hasta <= 7 THEN 'gracia'
    ELSE 'pausada'
  END;
$$;

COMMENT ON FUNCTION situacion_suscripcion(text, date) IS
  'Situación efectiva: cortesia | al_dia | por_vencer | gracia | pausada. Fuente única de la regla.';

GRANT EXECUTE ON FUNCTION situacion_suscripcion(text, date) TO authenticated;

-- ============================================
-- 3. Lo que ve el dueño de su propio local
--
-- SECURITY INVOKER a propósito, igual que los `reporte_*` de F6: así la RLS de
-- `locales` hace el aislamiento sola y un local no puede consultar la
-- suscripción de otro ni por error de programación.
-- ============================================

DROP FUNCTION IF EXISTS estado_suscripcion(uuid);

CREATE OR REPLACE FUNCTION estado_suscripcion(p_local_id uuid)
RETURNS TABLE (
  plan text,
  estado text,
  hasta date,
  situacion text,
  dias_restantes int,
  pedidos_habilitados boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    l.plan,
    l.suscripcion_estado,
    l.suscripcion_hasta,
    situacion_suscripcion(l.suscripcion_estado, l.suscripcion_hasta),
    (l.suscripcion_hasta - (now() AT TIME ZONE 'America/Santiago')::date)::int,
    situacion_suscripcion(l.suscripcion_estado, l.suscripcion_hasta) <> 'pausada'
  FROM locales l
  WHERE l.id = p_local_id;
$$;

GRANT EXECUTE ON FUNCTION estado_suscripcion(uuid) TO authenticated;

-- ============================================
-- 4. Privilegios de columna
--
-- T4 dejó `locales` con GRANT UPDATE por columna. Las columnas nuevas no entran
-- en esa lista, así que el staff no puede tocarlas — pero se deja explícito y
-- con test, porque de esto depende que un local no se autoprorrogue la
-- suscripción con una llamada desde el navegador.
-- ============================================

REVOKE UPDATE (plan, suscripcion_estado, suscripcion_hasta, suscripcion_notas)
  ON locales FROM authenticated, anon;

-- ============================================
-- 5. El menú público informa si toma pedidos, sin decir por qué
--
-- El comensal no tiene por qué enterarse de que el local no pagó: vería la ropa
-- sucia de nuestro cliente. Solo viaja un booleano.
-- Lista BLANCA de columnas (F7): agregar una columna a `locales` no la expone.
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
      'mesas',          l.mesas,
      'pedidos_habilitados',
        situacion_suscripcion(l.suscripcion_estado, l.suscripcion_hasta) <> 'pausada'
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

-- ============================================
-- 6. crear_pedido v8 — el corte de verdad, en el servidor
--
-- Ocultar el botón en el navegador no es un corte: es una sugerencia. El único
-- lugar donde un pedido puede nacer es esta función, así que acá se decide.
--
-- La firma no cambia respecto de v7, así que se reemplaza en su lugar: no hay
-- DROP y por lo tanto no existe un instante en que la función no exista ni una
-- segunda versión viva sin este control.
--
-- El cuerpo es el de v7 palabra por palabra salvo el bloque marcado F10.
-- ============================================

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
  v_susc_estado text;   -- F10
  v_susc_hasta date;    -- F10
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
  -- devuelve el mismo id. Va ANTES del control de suscripción a propósito: un
  -- pedido ya creado se devuelve siempre, incluso si la cuenta se pausó en el
  -- medio. Lo contrario dejaría al comensal reintentando un pedido que la
  -- cocina ya está preparando.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existente FROM pedidos WHERE client_request_id = p_client_request_id;
    IF v_existente IS NOT NULL THEN
      RETURN v_existente;
    END IF;
  END IF;

  SELECT activo, COALESCE(limite_pedidos_min, 40), suscripcion_estado, suscripcion_hasta
    INTO v_local_activo, v_limite, v_susc_estado, v_susc_hasta
    FROM locales WHERE id = p_local_id;
  IF v_local_activo IS NULL OR v_local_activo = false THEN
    RAISE EXCEPTION 'Local no disponible';
  END IF;

  -- SUSCRIPCIÓN (F10). El mensaje es neutro a propósito: lo lee el comensal en
  -- su teléfono y no tiene por qué saber que el local no pagó.
  IF situacion_suscripcion(v_susc_estado, v_susc_hasta) = 'pausada' THEN
    RAISE EXCEPTION 'Este local no está recibiendo pedidos por ahora';
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

-- VERIFICACION
-- SELECT slug, plan, suscripcion_estado, suscripcion_hasta,
--        situacion_suscripcion(suscripcion_estado, suscripcion_hasta) FROM locales;
-- SELECT get_menu_publico('el-lalo') -> 'local' ->> 'pedidos_habilitados';  -- true
-- SELECT get_menu_publico('el-lalo') -> 'local' ? 'suscripcion_estado';     -- false
-- SELECT grantee, column_name FROM information_schema.column_privileges
--   WHERE table_name = 'locales' AND privilege_type = 'UPDATE' ORDER BY column_name;
