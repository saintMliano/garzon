-- ============================================
-- GARZÓN DIGITAL — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Tabla de locales (multi-tenant)
CREATE TABLE locales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  direccion TEXT,
  telefono TEXT,
  logo_url TEXT,
  color_primario TEXT DEFAULT '#f97316',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de categorías
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id UUID REFERENCES locales(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  icono TEXT,
  orden INT DEFAULT 0
);

-- 3. Tabla de productos
CREATE TABLE productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id UUID REFERENCES locales(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio INT NOT NULL,
  imagen_url TEXT,
  disponible BOOLEAN DEFAULT true,
  orden INT DEFAULT 0
);

-- 4. Tabla de pedidos
CREATE TABLE pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id UUID REFERENCES locales(id) ON DELETE CASCADE,
  numero_pedido SERIAL,
  estado TEXT DEFAULT 'nuevo' CHECK (estado IN ('nuevo','aceptado','preparando','listo','entregado')),
  nombre_cliente TEXT NOT NULL,
  mesa TEXT,
  total INT NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Detalle del pedido (items)
CREATE TABLE pedido_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,
  cantidad INT NOT NULL DEFAULT 1,
  precio_unitario INT NOT NULL,
  notas TEXT
);

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX idx_productos_local ON productos(local_id);
CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_pedidos_local ON pedidos(local_id);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_pedidos_created ON pedidos(created_at DESC);
CREATE INDEX idx_pedido_items_pedido ON pedido_items(pedido_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

-- Public read access for locales, categorias, productos (the menu is public)
CREATE POLICY "Public read locales" ON locales FOR SELECT USING (activo = true);
CREATE POLICY "Public read categorias" ON categorias FOR SELECT USING (true);
CREATE POLICY "Public read productos" ON productos FOR SELECT USING (true);

-- Public insert for pedidos and items (customers create orders without auth)
CREATE POLICY "Public insert pedidos" ON pedidos FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read pedidos" ON pedidos FOR SELECT USING (true);
CREATE POLICY "Public update pedidos" ON pedidos FOR UPDATE USING (true);
CREATE POLICY "Public insert pedido_items" ON pedido_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read pedido_items" ON pedido_items FOR SELECT USING (true);

-- ============================================
-- ENABLE REALTIME on pedidos table
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;

-- ============================================
-- SEED DATA: Local demo "Fuente de Soda El Lalo"
-- ============================================
INSERT INTO locales (nombre, slug, direccion, telefono, color_primario) VALUES
  ('Fuente de Soda El Lalo', 'el-lalo', 'Av. Valparaíso 1234, Viña del Mar', '+56912345678', '#f97316');

-- Get the local_id for seeding
DO $$
DECLARE
  v_local_id UUID;
  v_cat_sandwiches UUID;
  v_cat_bebidas UUID;
  v_cat_completos UUID;
  v_cat_papas UUID;
BEGIN
  SELECT id INTO v_local_id FROM locales WHERE slug = 'el-lalo';

  -- Categories
  INSERT INTO categorias (local_id, nombre, icono, orden) VALUES
    (v_local_id, 'Sándwiches', '🥪', 1) RETURNING id INTO v_cat_sandwiches;
  INSERT INTO categorias (local_id, nombre, icono, orden) VALUES
    (v_local_id, 'Completos', '🌭', 2) RETURNING id INTO v_cat_completos;
  INSERT INTO categorias (local_id, nombre, icono, orden) VALUES
    (v_local_id, 'Papas Fritas', '🍟', 3) RETURNING id INTO v_cat_papas;
  INSERT INTO categorias (local_id, nombre, icono, orden) VALUES
    (v_local_id, 'Bebidas', '🥤', 4) RETURNING id INTO v_cat_bebidas;

  -- Sándwiches
  INSERT INTO productos (local_id, categoria_id, nombre, descripcion, precio, orden) VALUES
    (v_local_id, v_cat_sandwiches, 'Barros Luco', 'Carne y queso derretido', 4500, 1),
    (v_local_id, v_cat_sandwiches, 'Barros Jarpa', 'Jamón y queso derretido', 3800, 2),
    (v_local_id, v_cat_sandwiches, 'Chacarero', 'Carne, tomate, poroto verde, ají verde', 4800, 3),
    (v_local_id, v_cat_sandwiches, 'Lomito', 'Lomo de cerdo, tomate, mayo', 5200, 4),
    (v_local_id, v_cat_sandwiches, 'Churrasco', 'Carne a la plancha, tomate, mayo', 4900, 5),
    (v_local_id, v_cat_sandwiches, 'Ave Mayo', 'Pollo desmenuzado con mayonesa', 4200, 6),
    (v_local_id, v_cat_sandwiches, 'Ave Palta', 'Pollo desmenuzado con palta', 5000, 7);

  -- Completos
  INSERT INTO productos (local_id, categoria_id, nombre, descripcion, precio, orden) VALUES
    (v_local_id, v_cat_completos, 'Completo', 'Vienesa, tomate, mayo, chucrut', 2800, 1),
    (v_local_id, v_cat_completos, 'Italiano', 'Vienesa, tomate, mayo, palta', 3200, 2),
    (v_local_id, v_cat_completos, 'Dinámico', 'Vienesa, tomate, mayo, chucrut, palta', 3500, 3),
    (v_local_id, v_cat_completos, 'AS Completo', 'Doble vienesa, todos los agregados', 4200, 4);

  -- Papas Fritas
  INSERT INTO productos (local_id, categoria_id, nombre, descripcion, precio, orden) VALUES
    (v_local_id, v_cat_papas, 'Papas Fritas Porción', 'Porción individual crocante', 2500, 1),
    (v_local_id, v_cat_papas, 'Papas Fritas Familiar', 'Porción para compartir', 4500, 2),
    (v_local_id, v_cat_papas, 'Papas con Cheddar', 'Papas fritas con queso cheddar y tocino', 5500, 3);

  -- Bebidas
  INSERT INTO productos (local_id, categoria_id, nombre, descripcion, precio, orden) VALUES
    (v_local_id, v_cat_bebidas, 'Coca-Cola 350ml', 'Lata', 1200, 1),
    (v_local_id, v_cat_bebidas, 'Coca-Cola 1.5L', 'Botella', 2200, 2),
    (v_local_id, v_cat_bebidas, 'Sprite 350ml', 'Lata', 1200, 3),
    (v_local_id, v_cat_bebidas, 'Fanta 350ml', 'Lata', 1200, 4),
    (v_local_id, v_cat_bebidas, 'Agua Mineral 600ml', 'Sin gas', 1000, 5),
    (v_local_id, v_cat_bebidas, 'Jugo Natural', 'Naranja o durazno', 1800, 6);
END $$;
