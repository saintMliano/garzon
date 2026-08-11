-- ============================================
-- GARZÓN DIGITAL — F6: cierre de caja (RPCs de reportes)
--
-- Hallazgo A5 de la auditoría 2026-08-10: el plan comercial le promete al dueño
-- "este mes procesaste X pedidos", pero ese dato no se podía obtener sin SQL.
-- El header del dashboard solo mostraba un contador que se borraba a medianoche.
--
-- DECISIÓN DE SEGURIDAD — estas funciones son SECURITY **INVOKER** (el default),
-- a diferencia de `crear_pedido`, que es DEFINER:
--   `crear_pedido` necesita DEFINER porque el cliente anónimo no tiene permiso
--   sobre `pedidos` y la función tiene que actuar por él. Acá es al revés: quien
--   llama es staff autenticado, así que dejando INVOKER **la RLS existente hace
--   el aislamiento por local sola**. Un usuario que no sea staff del local
--   simplemente no ve filas y recibe ceros — no hay forma de que estas funciones
--   filtren datos de otro local, porque no tienen ningún privilegio extra.
--   Es más seguro que verificar la membresía a mano dentro de la función.
--
-- ZONA HORARIA — todos los cortes de día se hacen en America/Santiago, igual que
-- la numeración de pedidos. `p_desde`/`p_hasta` son fechas de calendario chileno
-- y ambas son INCLUSIVAS.
--
-- Sumas en bigint: `pedidos.total` es int y un mes de ventas lo desborda.
--
-- Idempotente.
-- ============================================

-- ============================================
-- 1. Resumen del período
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
  ticket_promedio     int
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
    -- Ticket promedio sobre los no cancelados. El FILTER en el divisor evita
    -- la división por cero: sin pedidos, NULLIF lo vuelve NULL y COALESCE 0.
    COALESCE(
      (COALESCE(sum(total) FILTER (WHERE estado <> 'cancelado'), 0)
       / NULLIF(count(*) FILTER (WHERE estado <> 'cancelado'), 0))::int,
      0
    )
  FROM rango;
$$;

-- ============================================
-- 2. Serie diaria (para el gráfico de barras)
-- ============================================
CREATE OR REPLACE FUNCTION reporte_ventas_por_dia(
  p_local_id uuid,
  p_desde date,
  p_hasta date
) RETURNS TABLE (
  dia     date,
  pedidos int,
  venta   bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (created_at AT TIME ZONE 'America/Santiago')::date AS dia,
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

-- ============================================
-- 3. Productos más vendidos del período
-- ============================================
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
LANGUAGE sql
STABLE
SET search_path = public
AS $$
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
$$;

-- ============================================
-- 4. Permisos: solo staff autenticado. `anon` NO ejecuta reportes.
-- ============================================
REVOKE ALL ON FUNCTION reporte_ventas(uuid,date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION reporte_ventas_por_dia(uuid,date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION reporte_top_productos(uuid,date,date,int) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION reporte_ventas(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION reporte_ventas_por_dia(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION reporte_top_productos(uuid,date,date,int) TO authenticated;

-- ============================================
-- 5. Índice para la ruta caliente del reporte
-- ============================================
-- El filtro es siempre (local_id, created_at). Ya existen índices sueltos de
-- cada columna; el compuesto evita el bitmap-and cuando el rango es un mes.
CREATE INDEX IF NOT EXISTS idx_pedidos_local_created ON pedidos(local_id, created_at);

-- VERIFICACION
-- SELECT * FROM reporte_ventas('<local_id>', current_date, current_date);
-- SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'reporte_%';  -- prosecdef debe ser false
