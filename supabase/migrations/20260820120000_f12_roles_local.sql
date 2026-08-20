-- ============================================
-- GARZÓN DIGITAL — F12.1: Roles por local
--
-- Hasta ahora una fila en `local_staff` equivalía a ser dueño: las trece
-- políticas RLS del proyecto usaban el mismo predicado, así que quien podía
-- entrar al panel podía cambiar precios, borrar el menú y ver la caja.
--
-- Dos roles, decisión del dueño (plan/ROLES-Y-COMANDA.md §9):
--   'dueño'    — todo.
--   'personal' — Kanban completo (incluido cancelar y reabrir), marcar
--                agotado, y tomar pedidos desde la comanda. NO: reportes,
--                precios, fotos, identidad del local, ni gestión de gente.
--
-- Idempotente.
-- ============================================

-- ============================================
-- 1. La columna. El DEFAULT es lo que protege a los locales que ya existen:
--    las filas actuales quedan como 'dueño' sin tocar una sola de ellas a mano.
-- ============================================
ALTER TABLE local_staff ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'dueño';

DO $$
BEGIN
  ALTER TABLE local_staff ADD CONSTRAINT local_staff_rol_valido
    CHECK (rol IN ('dueño', 'personal'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cinturón y tirantes: si alguien corrió una versión previa de esta migración
-- sin DEFAULT, esto deja las filas huérfanas como dueño en vez de dejarlas
-- fuera de su propio local.
UPDATE local_staff SET rol = 'dueño' WHERE rol IS NULL;

-- El rol se escribe solo por service-role (endpoint /api/local/equipo).
-- Sin esto, un dueño podría promoverse... o peor, un `personal` podría
-- ascenderse a sí mismo con un UPDATE directo desde el navegador.
REVOKE UPDATE (rol) ON local_staff FROM authenticated, anon;

CREATE INDEX IF NOT EXISTS idx_local_staff_local ON local_staff(local_id);

-- ============================================
-- 2. Helper de rol.
--    SECURITY DEFINER a propósito: lo llaman funciones que corren como el
--    usuario, y necesita ver la fila de `local_staff` sin depender de que la
--    RLS de esa tabla siga permitiendo leer la propia.
-- ============================================
CREATE OR REPLACE FUNCTION tiene_rol(p_local_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM local_staff s
    WHERE s.user_id = auth.uid()
      AND s.local_id = p_local_id
      AND s.rol = ANY(p_roles)
  );
$$;

REVOKE ALL ON FUNCTION tiene_rol(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tiene_rol(uuid, text[]) TO authenticated;

-- ============================================
-- 3. RLS del menú: escribir el menú pasa a ser exclusivo del dueño.
--    Se conserva la forma exacta del predicado que ya estaba verificado y solo
--    se le agrega la condición de rol.
-- ============================================
DROP POLICY IF EXISTS "Staff insert categorias" ON categorias;
CREATE POLICY "Staff insert categorias" ON categorias
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = categorias.local_id AND s.rol = 'dueño'));

DROP POLICY IF EXISTS "Staff update categorias" ON categorias;
CREATE POLICY "Staff update categorias" ON categorias
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = categorias.local_id AND s.rol = 'dueño'))
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = categorias.local_id AND s.rol = 'dueño'));

DROP POLICY IF EXISTS "Staff delete categorias" ON categorias;
CREATE POLICY "Staff delete categorias" ON categorias
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = categorias.local_id AND s.rol = 'dueño'));

DROP POLICY IF EXISTS "Staff insert productos" ON productos;
CREATE POLICY "Staff insert productos" ON productos
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = productos.local_id AND s.rol = 'dueño'));

-- OJO: `personal` NO entra acá. La RLS no sabe restringir columnas, así que si
-- se le diera UPDATE para marcar agotado también podría cambiar el precio.
-- Para eso existe `marcar_disponibilidad()` más abajo.
DROP POLICY IF EXISTS "Staff update productos" ON productos;
CREATE POLICY "Staff update productos" ON productos
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = productos.local_id AND s.rol = 'dueño'))
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = productos.local_id AND s.rol = 'dueño'));

DROP POLICY IF EXISTS "Staff delete productos" ON productos;
CREATE POLICY "Staff delete productos" ON productos
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = productos.local_id AND s.rol = 'dueño'));

DROP POLICY IF EXISTS "Staff update locales" ON locales;
CREATE POLICY "Staff update locales" ON locales
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = locales.id AND s.rol = 'dueño'))
  WITH CHECK (EXISTS (SELECT 1 FROM local_staff s WHERE s.user_id = auth.uid() AND s.local_id = locales.id AND s.rol = 'dueño'));

-- ============================================
-- 4. Storage: las fotos del menú son parte del menú.
--    La lectura pública ("menu public read") no se toca.
-- ============================================
DROP POLICY IF EXISTS "menu staff insert" ON storage.objects;
CREATE POLICY "menu staff insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu'
    AND (storage.foldername(name))[1] IN (
      SELECT local_id::text FROM public.local_staff WHERE user_id = auth.uid() AND rol = 'dueño'
    )
  );

DROP POLICY IF EXISTS "menu staff update" ON storage.objects;
CREATE POLICY "menu staff update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu'
    AND (storage.foldername(name))[1] IN (
      SELECT local_id::text FROM public.local_staff WHERE user_id = auth.uid() AND rol = 'dueño'
    )
  );

DROP POLICY IF EXISTS "menu staff delete" ON storage.objects;
CREATE POLICY "menu staff delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu'
    AND (storage.foldername(name))[1] IN (
      SELECT local_id::text FROM public.local_staff WHERE user_id = auth.uid() AND rol = 'dueño'
    )
  );

-- ============================================
-- 5. "Se acabó el lomito": lo único del menú que la cocina toca en pleno
--    servicio. Va por RPC porque la RLS no restringe columnas — es la única
--    forma de dejar pasar `disponible` sin dejar pasar `precio`.
-- ============================================
CREATE OR REPLACE FUNCTION marcar_disponibilidad(p_producto_id uuid, p_disponible boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_id uuid;
BEGIN
  SELECT local_id INTO v_local_id FROM productos WHERE id = p_producto_id;
  IF v_local_id IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF NOT tiene_rol(v_local_id, ARRAY['dueño', 'personal']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE productos SET disponible = p_disponible WHERE id = p_producto_id;
END;
$$;

REVOKE ALL ON FUNCTION marcar_disponibilidad(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION marcar_disponibilidad(uuid, boolean) TO authenticated;

-- ============================================
-- 6. Reportes: la caja es del dueño.
--
--    Son CINCO funciones, no tres: F10 agregó `reporte_ventas_por_mes` y
--    `reporte_tiempos`, y le sumó `propinas_total` a `reporte_ventas`. Los
--    cuerpos de acá salen de `pg_get_functiondef` sobre la base viva, no de las
--    migraciones antiguas — que ya estaban desactualizadas.
--
--    Siguen siendo SECURITY **INVOKER** — la regla de F6 no se toca y el test
--    de aislamiento sigue verde. Pasan de `LANGUAGE sql` a `plpgsql` solo para
--    poder levantar la excepción; `prosecdef` no cambia. Los parámetros de
--    salida se mantienen idénticos, que es lo único que CREATE OR REPLACE no
--    perdona (SQLSTATE 42P13).
--
--    La guarda está escrita para NO alterar el comportamiento entre locales:
--    si quien llama no es del local, no entra al IF y la RLS devuelve ceros
--    como siempre. Solo revienta si es del local y es `personal`. Son dos
--    controles distintos y ninguno reemplaza al otro.
-- ============================================
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
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF tiene_rol(p_local_id, ARRAY['personal']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
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
    -- La propina NO se suma a venta_total: es plata del personal, no venta.
    COALESCE(sum(propina) FILTER (WHERE estado <> 'cancelado'), 0)::bigint
  FROM rango;
END;
$$;

-- `pedidos` es a la vez el nombre de la tabla y de una columna de salida, así
-- que acá la tabla va aliaseada y las referencias calificadas. Es la única
-- diferencia con el cuerpo original y no cambia el resultado.
CREATE OR REPLACE FUNCTION reporte_ventas_por_dia(
  p_local_id uuid,
  p_desde date,
  p_hasta date
) RETURNS TABLE (
  dia     date,
  pedidos int,
  venta   bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF tiene_rol(p_local_id, ARRAY['personal']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    (p.created_at AT TIME ZONE 'America/Santiago')::date AS dia,
    count(*)::int,
    COALESCE(sum(p.total), 0)::bigint
  FROM pedidos p
  WHERE p.local_id = p_local_id
    AND p.estado <> 'cancelado'
    AND p.created_at >= (p_desde::timestamp AT TIME ZONE 'America/Santiago')
    AND p.created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Santiago')
  GROUP BY 1
  ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION reporte_ventas_por_mes(
  p_local_id uuid,
  p_desde date,
  p_hasta date
) RETURNS TABLE (
  mes     date,
  pedidos int,
  venta   bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF tiene_rol(p_local_id, ARRAY['personal']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    date_trunc('month', (p.created_at AT TIME ZONE 'America/Santiago'))::date AS mes,
    count(*)::int,
    COALESCE(sum(p.total), 0)::bigint
  FROM pedidos p
  WHERE p.local_id = p_local_id
    AND p.estado <> 'cancelado'
    AND p.created_at >= (p_desde::timestamp AT TIME ZONE 'America/Santiago')
    AND p.created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Santiago')
  GROUP BY 1
  ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION reporte_top_productos(
  p_local_id uuid,
  p_desde date,
  p_hasta date,
  p_limite int DEFAULT 10
) RETURNS TABLE (
  producto_id uuid,
  nombre      text,
  unidades    bigint,
  venta       bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF tiene_rol(p_local_id, ARRAY['personal']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    i.producto_id,
    -- productos.producto_id es ON DELETE SET NULL: un producto borrado del menú
    -- deja ítems históricos sin nombre. Se muestran igual para que la suma del
    -- reporte cuadre con la venta real.
    COALESCE(pr.nombre, 'Producto eliminado')::text,
    sum(i.cantidad)::bigint,
    sum(i.cantidad::bigint * i.precio_unitario)::bigint
  FROM pedido_items i
  JOIN pedidos p ON p.id = i.pedido_id
  LEFT JOIN productos pr ON pr.id = i.producto_id
  WHERE p.local_id = p_local_id
    AND p.estado <> 'cancelado'
    AND p.created_at >= (p_desde::timestamp AT TIME ZONE 'America/Santiago')
    AND p.created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Santiago')
  GROUP BY i.producto_id, pr.nombre
  ORDER BY 3 DESC, 2 ASC
  LIMIT COALESCE(p_limite, 10);
END;
$$;

CREATE OR REPLACE FUNCTION reporte_tiempos(
  p_local_id uuid,
  p_desde date,
  p_hasta date
) RETURNS TABLE (
  pedidos_medidos       int,
  seg_hasta_aceptado    int,
  seg_hasta_listo       int,
  seg_hasta_entregado   int
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF tiene_rol(p_local_id, ARRAY['personal']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH hitos AS (
    SELECT
      e.pedido_id,
      min(e.created_at) FILTER (WHERE e.estado_nuevo = 'nuevo')      AS t_nuevo,
      min(e.created_at) FILTER (WHERE e.estado_nuevo = 'aceptado')   AS t_aceptado,
      min(e.created_at) FILTER (WHERE e.estado_nuevo = 'listo')      AS t_listo,
      min(e.created_at) FILTER (WHERE e.estado_nuevo = 'entregado')  AS t_entregado
    FROM pedido_eventos e
    WHERE e.local_id = p_local_id
      AND e.created_at >= (p_desde::timestamp AT TIME ZONE 'America/Santiago')
      AND e.created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Santiago')
    GROUP BY e.pedido_id
  )
  SELECT
    count(*) FILTER (WHERE t_nuevo IS NOT NULL)::int,
    -- Medianas y no promedios: un pedido olvidado media hora en la pantalla
    -- distorsiona un promedio y hace inservible la métrica.
    COALESCE(percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (t_aceptado - t_nuevo))
    ), 0)::int,
    COALESCE(percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (t_listo - t_nuevo))
    ), 0)::int,
    COALESCE(percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (t_entregado - t_nuevo))
    ), 0)::int
  FROM hitos;
END;
$$;

-- ============================================
-- 7. "Frecuentes" de la comanda.
--
--    NO se reusa `reporte_top_productos`: esa devuelve `venta` — plata — y
--    quien usa la comanda es `personal`, justamente a quien le estamos cerrando
--    la caja. Esta devuelve unidades y nada más.
-- ============================================
CREATE OR REPLACE FUNCTION productos_frecuentes(
  p_local_id uuid,
  p_limite int DEFAULT 12,
  p_dias int DEFAULT 30
) RETURNS TABLE (
  producto_id uuid,
  unidades    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT tiene_rol(p_local_id, ARRAY['dueño', 'personal']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT i.producto_id, sum(i.cantidad)::bigint AS unidades
  FROM pedido_items i
  JOIN pedidos p ON p.id = i.pedido_id
  JOIN productos pr ON pr.id = i.producto_id
  WHERE p.local_id = p_local_id
    AND p.estado <> 'cancelado'
    AND p.created_at >= now() - make_interval(days => GREATEST(COALESCE(p_dias, 30), 1))
    AND pr.disponible = true
  GROUP BY i.producto_id
  ORDER BY 2 DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 12), 1), 40);
END;
$$;

REVOKE ALL ON FUNCTION productos_frecuentes(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION productos_frecuentes(uuid, int, int) TO authenticated;

-- ============================================
-- 8. Atribución: ¿quién tomó este pedido?
--
--    Va por trigger y no dentro de `crear_pedido` a propósito: esa función ya
--    va en su versión 9 y reproducir 150 líneas para agregar una asignación es
--    la forma clásica de que se desvíe del original sin que nadie lo note.
--
--    `auth.uid()` sale del JWT del request, no del rol de ejecución, así que
--    funciona igual dentro de una función SECURITY DEFINER. Para el comensal
--    anónimo devuelve NULL, que es exactamente lo que queremos guardar.
-- ============================================
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION pedidos_set_creado_por()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.creado_por := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_creado_por ON pedidos;
CREATE TRIGGER trg_pedidos_creado_por
  BEFORE INSERT ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION pedidos_set_creado_por();

-- El staff lee la atribución pero no la escribe: es un registro de quién hizo
-- qué, y un registro que el interesado puede editar no sirve de nada.
REVOKE UPDATE (creado_por) ON pedidos FROM authenticated, anon;

-- ============================================
-- VERIFICACION
-- ============================================
-- SELECT rol, count(*) FROM local_staff GROUP BY rol;
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename IN ('categorias','productos','locales') ORDER BY tablename, policyname;
-- SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'reporte_%';   -- debe seguir siendo false
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'pedidos'::regclass AND NOT tgisinternal;
