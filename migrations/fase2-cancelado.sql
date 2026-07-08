-- ============================================
-- GARZÓN DIGITAL — Fase 2: Estado 'cancelado'
-- Amplía el CHECK de pedidos.estado para permitir el rechazo/cancelación
-- de un pedido por la cocina. Idempotente (drop + add).
-- ============================================

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('nuevo','aceptado','preparando','listo','entregado','cancelado'));

-- VERIFICACION
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'pedidos_estado_check';
