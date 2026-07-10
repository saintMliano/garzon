# T2 — Endurecer `crear_pedido`: rate-limit, topes y fix de carrera (P1)

**Tipo:** SQL (una migración) + un ajuste menor de mensaje en el cliente.
**Hallazgos que resuelve:** S2 y M1 de [`AUDITORIA.md`](../AUDITORIA.md).

## Contexto

`crear_pedido` es ejecutable por el rol `anon` (así debe seguir: el cliente pide sin login), pero
hoy no tiene límite de frecuencia ni de tamaño, y lee el precio de cada producto **dos veces**
(una para el total, otra para los items), lo que permite que total e items diverjan si un precio
cambia entre ambas lecturas. La versión vigente de la función está en
`migrations/fase3-multitenant.sql` (líneas 49-140); esta tarea la reemplaza por una v4.

## Pasos

1. Crear `migrations/consolidacion-t2-crear-pedido-v4.sql` con **exactamente** este contenido:

```sql
-- ============================================
-- GARZÓN DIGITAL — Consolidación T2: crear_pedido v4
-- Igual que v3 (total en servidor, numeración por local/día bajo advisory
-- lock) + rate-limit por local, topes de tamaño y UNA SOLA lectura de
-- precios (fix de la carrera total/items). Idempotente.
-- ============================================

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
  v_total bigint := 0;
  v_pedido_id uuid;
  v_nombre_limpio text;
  v_numero int;
  v_recientes int;
  -- Items validados con su precio, leídos UNA sola vez.
  v_items_validados jsonb := '[]'::jsonb;
  v_precio_real int;
BEGIN
  -- Validar local
  SELECT activo INTO v_local_activo FROM locales WHERE id = p_local_id;
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

  -- Rate-limit: máx. 15 pedidos por local por minuto (anti-spam anónimo).
  SELECT count(*) INTO v_recientes
  FROM pedidos
  WHERE local_id = p_local_id AND created_at > now() - interval '60 seconds';
  IF v_recientes >= 15 THEN
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
-- SELECT prosrc FROM pg_proc WHERE proname = 'crear_pedido';
```

2. Aplicar la migración en el SQL Editor de Supabase.
3. En `src/app/local/[slug]/checkout-modal.tsx` (función `handleSubmit`, bloque `catch`), agregar
   un caso para el mensaje de rate-limit, antes del `else` final:

```ts
} else if (message.includes("Demasiados pedidos")) {
  setError("El local está recibiendo muchos pedidos; espera un minuto e intenta de nuevo.");
```

## Criterios de aceptación

- Un pedido normal desde `/local/el-lalo` sigue funcionando igual (total correcto, numeración
  correlativa del día, seguimiento en vivo).
- Un item con `cantidad` 100+ o un pedido con 51+ productos distintos es rechazado con error claro.
- El pedido 16.º dentro del mismo minuto para el mismo local es rechazado; al minuto siguiente
  vuelve a funcionar.
- Los `precio_unitario` de `pedido_items` siempre suman exactamente `pedidos.total`.

## Verificación

1. `npm run dev`, crear un pedido real en `/local/el-lalo` → aparece en `/dashboard`.
2. Desde la consola del navegador (página del menú, cliente anónimo ya cargado), llamar
   `supabase.rpc('crear_pedido', ...)` no es accesible directamente; usar en su lugar el SQL Editor:
   `SELECT crear_pedido('<id el-lalo>', 'Test', NULL, NULL, '[{"producto_id":"<id>","cantidad":100}]'::jsonb);`
   → debe fallar con "Cantidad inválida".
3. En SQL Editor, ejecutar 16 veces `SELECT crear_pedido(...)` válido → la 16.ª debe fallar con
   "Demasiados pedidos…".
4. **Limpiar** todos los pedidos de prueba:
   `DELETE FROM pedidos WHERE nombre_cliente = 'Test' AND local_id = '<id el-lalo>';`
   (los items caen por `ON DELETE CASCADE`).

## Qué NO hacer

- No cambiar la firma de la función (el cliente la llama con esos 5 parámetros).
- No quitar el advisory lock ni la numeración por día.
- No tocar `get_order_status`.

## Al terminar

Marcar T2 en `plan/README.md`, entrada fechada en `developer-context.md`, commit en rama
`consolidacion/t2-crear-pedido`.
