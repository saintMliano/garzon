-- ============================================
-- GARZÓN DIGITAL — Teléfono del comensal y tipo de entrega
--
-- Hasta hoy la base guardaba un nombre de pila y una mesa: nada que identifique
-- a una persona. Un teléfono SÍ la identifica, así que este cambio convierte a
-- la plataforma en tratante de datos personales de terceros. Todo lo que sigue
-- está diseñado para eso, y el plan completo (incluido el análisis legal) está
-- en `plan/TELEFONO-COMENSAL.md`.
--
-- Tres decisiones que sostienen el resto:
--
-- 1. El teléfono se pide SOLO cuando el pedido es para retiro, porque ahí es
--    necesario para cumplirlo. Pedirlo "por si acaso" a quien está sentado en la
--    mesa rompe el principio de proporcionalidad y debilita la base legal.
--
-- 2. Se guarda SIEMPRE en E.164 (+569XXXXXXXX). Un mismo número escrito de
--    cuatro maneras es un número imposible de borrar cuando alguien ejerza su
--    derecho de supresión.
--
-- 3. Se BORRA SOLO a los 7 días. La mejor forma de responder una solicitud de
--    borrado es no tener el dato.
--
-- Idempotente.
-- ============================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo_entrega text;

UPDATE pedidos SET tipo_entrega = 'mesa' WHERE tipo_entrega IS NULL;
ALTER TABLE pedidos ALTER COLUMN tipo_entrega SET DEFAULT 'mesa';
ALTER TABLE pedidos ALTER COLUMN tipo_entrega SET NOT NULL;

COMMENT ON COLUMN pedidos.telefono IS
  'Móvil del comensal en E.164, solo para pedidos de retiro. Dato personal: se borra a los 7 días.';
COMMENT ON COLUMN pedidos.tipo_entrega IS
  'mesa | retiro. Antes se infería del texto libre de `mesa`, que era frágil.';

DO $bloque$
BEGIN
  ALTER TABLE pedidos ADD CONSTRAINT pedidos_tipo_entrega_valido
    CHECK (tipo_entrega IN ('mesa', 'retiro'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $bloque$;

DO $bloque$
BEGIN
  -- La base rechaza cualquier cosa que no sea un móvil chileno normalizado.
  -- Es la última línea: aunque alguien inserte por fuera de `crear_pedido`, no
  -- entra basura ni un formato distinto.
  ALTER TABLE pedidos ADD CONSTRAINT pedidos_telefono_valido
    CHECK (telefono IS NULL OR telefono ~ '^\+569[0-9]{8}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $bloque$;

-- El staff LEE el teléfono (es el punto: llamar al que viene a retirar) pero no
-- lo escribe. Igual que `total` y `propina`, solo nace desde `crear_pedido`.
-- T4 dejó `locales` con GRANT por columna y `pedidos` idem desde T3; las
-- columnas nuevas no entran en esas listas, pero se deja explícito y con test.
REVOKE UPDATE (telefono, tipo_entrega) ON pedidos FROM authenticated, anon;

-- ============================================
-- crear_pedido v9 — igual que v8 más teléfono y tipo de entrega
--
-- La firma cambia, así que se borra la anterior: no pueden quedar dos versiones
-- vivas, una de ellas incapaz de guardar el teléfono.
-- El cuerpo es el de v8 palabra por palabra salvo el bloque marcado.
-- ============================================

DROP FUNCTION IF EXISTS crear_pedido(uuid, text, text, text, jsonb, uuid, int);

CREATE OR REPLACE FUNCTION crear_pedido(
  p_local_id uuid,
  p_nombre text,
  p_mesa text,
  p_notas text,
  p_items jsonb,
  p_client_request_id uuid DEFAULT NULL,
  p_propina_pct int DEFAULT 0,
  p_telefono text DEFAULT NULL,
  p_tipo_entrega text DEFAULT 'mesa'
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
  v_telefono text;        -- F-tel
  v_tipo_entrega text;    -- F-tel
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

  -- TIPO DE ENTREGA. Se acota en vez de fallar: cualquier valor que no sea
  -- 'retiro' cae a 'mesa', que es la conducta de siempre.
  v_tipo_entrega := CASE
    WHEN lower(trim(coalesce(p_tipo_entrega, 'mesa'))) = 'retiro' THEN 'retiro'
    ELSE 'mesa'
  END;

  -- TELÉFONO. El navegador ya validó, pero el navegador no decide: se normaliza
  -- de nuevo acá y se guarda SIEMPRE en E.164, para que el mismo número no
  -- termine escrito de cuatro maneras distintas y sea imposible de borrar
  -- después cuando alguien ejerza su derecho de supresión.
  --
  -- Un teléfono ilegible NO tumba el pedido: se guarda NULL. Perder una venta
  -- real por un número mal tipeado es peor que no poder llamar; el comensal
  -- igual va a llegar a buscar su pedido.
  v_telefono := NULLIF(regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g'), '');

  -- Tolerante con lo que la gente pega desde sus contactos: '+56 9 ...' y el
  -- '0' de discado antiguo.
  IF v_telefono IS NOT NULL AND length(v_telefono) = 11 AND left(v_telefono, 2) = '56' THEN
    v_telefono := substr(v_telefono, 3);
  END IF;
  IF v_telefono IS NOT NULL AND length(v_telefono) = 10 AND left(v_telefono, 1) = '0' THEN
    v_telefono := substr(v_telefono, 2);
  END IF;

  -- Solo móvil chileno: 9 dígitos empezando en 9. Un fijo no sirve para avisarle
  -- a alguien que viene en camino a retirar.
  IF v_telefono IS NOT NULL AND v_telefono ~ '^9[0-9]{8}$' THEN
    v_telefono := '+56' || v_telefono;
  ELSE
    v_telefono := NULL;
  END IF;

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
    client_request_id, propina, propina_pct, telefono, tipo_entrega
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
    v_propina_pct,
    v_telefono,
    v_tipo_entrega
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

GRANT EXECUTE ON FUNCTION crear_pedido(uuid,text,text,text,jsonb,uuid,int,text,text) TO anon, authenticated;

-- ============================================
-- Borrado automático del teléfono
--
-- El pedido se conserva para los reportes de venta del local; lo que desaparece
-- es el dato personal pegado a él, que después de una semana ya no sirve para
-- nada salvo para filtrarse.
--
-- Se borra por EDAD, sin mirar el estado. La versión que solo tocaba pedidos
-- entregados o cancelados dejaba vivos para siempre los teléfonos de pedidos
-- abandonados en 'nuevo' o 'preparando' — justo los que nadie va a revisar.
-- Así ningún teléfono sobrevive los 7 días, pase lo que pase.
--
-- SECURITY DEFINER porque lo ejecuta el planificador, sin sesión de nadie.
-- ============================================

CREATE OR REPLACE FUNCTION borrar_telefonos_antiguos(p_dias int DEFAULT 7)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $funcion$
DECLARE
  v_borrados int;
BEGIN
  UPDATE pedidos
     SET telefono = NULL
   WHERE telefono IS NOT NULL
     AND COALESCE(updated_at, created_at) < now() - make_interval(days => p_dias);
  GET DIAGNOSTICS v_borrados = ROW_COUNT;
  RETURN v_borrados;
END;
$funcion$;

-- Nadie con una sesión de navegador tiene por qué invocar esto.
REVOKE ALL ON FUNCTION borrar_telefonos_antiguos(int) FROM PUBLIC, anon, authenticated;

-- Agendado diario. Best-effort: si `pg_cron` no está habilitado en el proyecto,
-- la migración NO falla — la función queda creada igual y el agendamiento se
-- resuelve aparte. Preferimos eso a que un `db push` se caiga entero por una
-- extensión que depende del plan de Supabase.
DO $bloque$
BEGIN
  PERFORM cron.schedule(
    'borrar-telefonos-antiguos',
    '20 4 * * *',
    $tarea$SELECT borrar_telefonos_antiguos(7)$tarea$
  );
EXCEPTION
  WHEN undefined_table OR undefined_function OR insufficient_privilege OR invalid_schema_name THEN
    RAISE NOTICE 'pg_cron no disponible: agendar borrar_telefonos_antiguos() a mano.';
END $bloque$;

-- VERIFICACION
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'pedidos' AND column_name IN ('telefono','tipo_entrega');
-- SELECT grantee, column_name FROM information_schema.column_privileges
--   WHERE table_name = 'pedidos' AND privilege_type = 'UPDATE' ORDER BY column_name;
-- SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'borrar-telefonos-antiguos';
