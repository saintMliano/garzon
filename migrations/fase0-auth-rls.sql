-- ============================================
-- GARZÓN DIGITAL — Fase 0: Auth + RLS hardening
-- Blindaje del plano de administración (cocina) con
-- autenticación, y enrutamiento de pedidos vía RPC.
-- Idempotente: puede correrse más de una vez sin fallar.
-- Run this in Supabase SQL Editor.
-- ============================================

-- ============================================
-- 1. Tabla local_staff (vincula auth.users con locales)
-- ============================================
CREATE TABLE IF NOT EXISTS local_staff (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, local_id)
);

ALTER TABLE local_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read own rows" ON local_staff;
CREATE POLICY "Staff read own rows" ON local_staff
  FOR SELECT
  USING (user_id = auth.uid());
-- Sin políticas de INSERT/UPDATE/DELETE públicas: el staff se administra por SQL/servicio.

-- ============================================
-- 2. Eliminar políticas públicas peligrosas en pedidos / pedido_items
-- ============================================
DROP POLICY IF EXISTS "Public read pedidos" ON pedidos;
DROP POLICY IF EXISTS "Public update pedidos" ON pedidos;
DROP POLICY IF EXISTS "Public insert pedidos" ON pedidos;
DROP POLICY IF EXISTS "Public read pedido_items" ON pedido_items;
DROP POLICY IF EXISTS "Public insert pedido_items" ON pedido_items;

-- (Las políticas públicas de SELECT sobre locales, categorias y productos
--  quedan intactas: el menú es público.)

-- ============================================
-- 3. Nuevas políticas RLS para pedidos (solo staff del local dueño)
-- ============================================
DROP POLICY IF EXISTS "Staff read pedidos" ON pedidos;
CREATE POLICY "Staff read pedidos" ON pedidos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM local_staff s
      WHERE s.user_id = auth.uid() AND s.local_id = pedidos.local_id
    )
  );

DROP POLICY IF EXISTS "Staff update pedidos" ON pedidos;
CREATE POLICY "Staff update pedidos" ON pedidos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM local_staff s
      WHERE s.user_id = auth.uid() AND s.local_id = pedidos.local_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM local_staff s
      WHERE s.user_id = auth.uid() AND s.local_id = pedidos.local_id
    )
  );
-- (Sin INSERT público; la creación de pedidos va por la RPC crear_pedido, SECURITY DEFINER.)

-- ============================================
-- 4. Nuevas políticas RLS para pedido_items (solo staff, vía join a pedidos)
-- ============================================
DROP POLICY IF EXISTS "Staff read pedido_items" ON pedido_items;
CREATE POLICY "Staff read pedido_items" ON pedido_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN local_staff s ON s.local_id = p.local_id
      WHERE p.id = pedido_items.pedido_id AND s.user_id = auth.uid()
    )
  );
-- (Sin INSERT público; los items se insertan dentro de la RPC crear_pedido.)

-- ============================================
-- 5. Constraints de integridad (idempotentes)
-- ============================================
DO $$
BEGIN
  ALTER TABLE productos ADD CONSTRAINT productos_precio_positivo CHECK (precio > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE pedidos ADD CONSTRAINT pedidos_total_positivo CHECK (total > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE pedido_items ADD CONSTRAINT pedido_items_cantidad_positiva CHECK (cantidad > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE pedido_items ADD CONSTRAINT pedido_items_precio_unitario_no_negativo CHECK (precio_unitario >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 6. RPC crear_pedido — creación de pedido con precios calculados en servidor
-- ============================================
CREATE OR REPLACE FUNCTION crear_pedido(
  p_local_id uuid,
  p_nombre text,
  p_mesa text,
  p_notas text,
  p_items jsonb           -- array de objetos: [{ "producto_id": uuid, "cantidad": int, "notas": text }]
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
  v_producto_nombre text;
  v_total int := 0;
  v_pedido_id uuid;
  v_nombre_limpio text;
BEGIN
  -- Validar local
  SELECT activo INTO v_local_activo FROM locales WHERE id = p_local_id;
  IF v_local_activo IS NULL OR v_local_activo = false THEN
    RAISE EXCEPTION 'Local no disponible';
  END IF;

  -- Validar nombre del cliente
  v_nombre_limpio := trim(coalesce(p_nombre, ''));
  IF v_nombre_limpio = '' THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;

  -- Validar items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no puede estar vacío';
  END IF;

  -- Calcular total leyendo precios reales del servidor
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para el producto %', v_producto_id;
    END IF;

    SELECT precio, nombre INTO v_precio_real, v_producto_nombre
    FROM productos
    WHERE id = v_producto_id AND local_id = p_local_id AND disponible = true;

    IF v_precio_real IS NULL THEN
      RAISE EXCEPTION 'Producto no disponible: %', v_producto_id;
    END IF;

    v_total := v_total + (v_cantidad * v_precio_real);
  END LOOP;

  -- Insertar pedido
  INSERT INTO pedidos (local_id, estado, nombre_cliente, mesa, total, notas)
  VALUES (
    p_local_id,
    'nuevo',
    v_nombre_limpio,
    NULLIF(trim(coalesce(p_mesa, '')), ''),
    v_total,
    NULLIF(trim(coalesce(p_notas, '')), '')
  )
  RETURNING id INTO v_pedido_id;

  -- Insertar items con precio_unitario leído del servidor
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

-- ============================================
-- 7. RPC get_order_status — consulta de estado para seguimiento del cliente
-- ============================================
CREATE OR REPLACE FUNCTION get_order_status(p_order_id uuid)
RETURNS TABLE (estado text, numero_pedido int, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT estado, numero_pedido, created_at
  FROM pedidos
  WHERE id = p_order_id;
$$;

GRANT EXECUTE ON FUNCTION get_order_status(uuid) TO anon, authenticated;

-- ============================================
-- 8. Asegurar RLS habilitado en pedidos y pedido_items
-- ============================================
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

-- ============================================
-- VERIFICACION
-- ============================================
-- SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('pedidos','pedido_items','local_staff') ORDER BY tablename, policyname;
-- SELECT proname, pg_get_function_identity_arguments(oid) AS args, prosecdef AS security_definer FROM pg_proc WHERE proname IN ('crear_pedido','get_order_status');
-- SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('productos_precio_positivo','pedidos_total_positivo','pedido_items_cantidad_positiva','pedido_items_precio_unitario_no_negativo');
