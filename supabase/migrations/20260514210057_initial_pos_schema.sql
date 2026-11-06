/*
  # POS Lounge Bar - Schema Initial Complet

  ## Nouvelles Tables
  1. `roles` - rôles utilisateurs (admin, cashier)
  2. `users` - comptes utilisateurs avec hash password
  3. `zones` - zones de l'établissement (terrasse, VIP, lounge, restaurant)
  4. `categories` - catégories produits avec couleur
  5. `products` - produits avec prix, catégorie, état
  6. `tables` - tables avec zone et état
  7. `orders` - commandes liées aux tables
  8. `order_items` - lignes de commande
  9. `settings` - paramètres de l'application
  10. `logs` - journal des actions utilisateurs

  ## Sécurité
  - RLS activé sur toutes les tables
  - Policies pour utilisateurs authentifiés uniquement
  - Données initiales: admin + cashier de démo
*/

-- ROLES
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read roles"
  ON roles FOR SELECT
  TO authenticated
  USING (true);

-- USERS (gestion interne de l'app, séparée de auth.users)
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read app_users"
  ON app_users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert app_users"
  ON app_users FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update app_users"
  ON app_users FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete app_users"
  ON app_users FOR DELETE
  TO authenticated
  USING (true);

-- ZONES
CREATE TABLE IF NOT EXISTS zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  color text DEFAULT '#3B82F6',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read zones"
  ON zones FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert zones"
  ON zones FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update zones"
  ON zones FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete zones"
  ON zones FOR DELETE
  TO authenticated
  USING (true);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  color text DEFAULT '#3B82F6',
  icon text DEFAULT 'Package',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read categories"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (true);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(10,0) NOT NULL DEFAULT 0,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  is_favorite boolean DEFAULT false,
  description text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (true);

-- TABLES
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  capacity integer DEFAULT 4,
  status text NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'closed')),
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read restaurant_tables"
  ON restaurant_tables FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert restaurant_tables"
  ON restaurant_tables FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update restaurant_tables"
  ON restaurant_tables FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete restaurant_tables"
  ON restaurant_tables FOR DELETE
  TO authenticated
  USING (true);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  table_name text NOT NULL DEFAULT '',
  cashier_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  cashier_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  total numeric(10,0) NOT NULL DEFAULT 0,
  amount_paid numeric(10,0) DEFAULT 0,
  change_due numeric(10,0) DEFAULT 0,
  notes text DEFAULT '',
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete orders"
  ON orders FOR DELETE
  TO authenticated
  USING (true);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  unit_price numeric(10,0) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  subtotal numeric(10,0) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read order_items"
  ON order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert order_items"
  ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update order_items"
  ON order_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete order_items"
  ON order_items FOR DELETE
  TO authenticated
  USING (true);

-- SETTINGS
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert settings"
  ON settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update settings"
  ON settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- LOGS
CREATE TABLE IF NOT EXISTS logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  username text NOT NULL DEFAULT '',
  action text NOT NULL,
  details text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read logs"
  ON logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert logs"
  ON logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- INDEX PERFORMANCES
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);

-- SEED DATA: Zones
INSERT INTO zones (name, color) VALUES
  ('Restaurant', '#10B981'),
  ('Lounge', '#F59E0B'),
  ('VIP', '#EF4444'),
  ('Terrasse', '#3B82F6')
ON CONFLICT (name) DO NOTHING;

-- SEED DATA: Categories
INSERT INTO categories (name, color, icon, sort_order) VALUES
  ('Bières', '#F59E0B', 'Beer', 1),
  ('Vins', '#DC2626', 'Wine', 2),
  ('Whisky', '#92400E', 'Whisky', 3),
  ('Cocktails', '#EC4899', 'Cocktail', 4),
  ('Softs', '#06B6D4', 'Coffee', 5),
  ('Plats', '#10B981', 'UtensilsCrossed', 6)
ON CONFLICT (name) DO NOTHING;

-- SEED DATA: Admin user (password: admin123 - stored as plain for demo, real app uses bcrypt)
INSERT INTO app_users (name, username, password_hash, role) VALUES
  ('Administrateur', 'admin', 'admin123', 'admin'),
  ('Caissier Demo', 'cashier', 'cashier123', 'cashier')
ON CONFLICT (username) DO NOTHING;

-- SEED DATA: Products (after categories are created)
DO $$
DECLARE
  cat_bieres uuid;
  cat_vins uuid;
  cat_whisky uuid;
  cat_cocktails uuid;
  cat_softs uuid;
  cat_plats uuid;
BEGIN
  SELECT id INTO cat_bieres FROM categories WHERE name = 'Bières' LIMIT 1;
  SELECT id INTO cat_vins FROM categories WHERE name = 'Vins' LIMIT 1;
  SELECT id INTO cat_whisky FROM categories WHERE name = 'Whisky' LIMIT 1;
  SELECT id INTO cat_cocktails FROM categories WHERE name = 'Cocktails' LIMIT 1;
  SELECT id INTO cat_softs FROM categories WHERE name = 'Softs' LIMIT 1;
  SELECT id INTO cat_plats FROM categories WHERE name = 'Plats' LIMIT 1;

  INSERT INTO products (name, price, category_id, is_favorite, sort_order) VALUES
    ('Primus', 2000, cat_bieres, true, 1),
    ('Heineken', 3000, cat_bieres, true, 2),
    ('Turbo King', 2500, cat_bieres, false, 3),
    ('Skol', 1500, cat_bieres, false, 4),
    ('Vin Rouge Maison', 5000, cat_vins, false, 1),
    ('Vin Blanc Maison', 5000, cat_vins, false, 2),
    ('Rosé', 5500, cat_vins, false, 3),
    ('Johnnie Walker Red', 8000, cat_whisky, true, 1),
    ('Jack Daniel''s', 9000, cat_whisky, true, 2),
    ('Jameson', 8500, cat_whisky, false, 3),
    ('Mojito', 6000, cat_cocktails, true, 1),
    ('Piña Colada', 6500, cat_cocktails, false, 2),
    ('Cosmopolitan', 7000, cat_cocktails, false, 3),
    ('Sex on the Beach', 6500, cat_cocktails, false, 4),
    ('Coca Cola', 1500, cat_softs, true, 1),
    ('Fanta Orange', 1500, cat_softs, false, 2),
    ('Eau Minérale', 1000, cat_softs, false, 3),
    ('Jus d''Orange', 2000, cat_softs, false, 4),
    ('Poulet Rôti', 12000, cat_plats, true, 1),
    ('Brochettes', 8000, cat_plats, true, 2),
    ('Frites', 3000, cat_plats, false, 3),
    ('Salade César', 7000, cat_plats, false, 4)
  ON CONFLICT DO NOTHING;
END $$;

-- SEED DATA: Tables
DO $$
DECLARE
  zone_resto uuid;
  zone_lounge uuid;
  zone_vip uuid;
  zone_terrasse uuid;
BEGIN
  SELECT id INTO zone_resto FROM zones WHERE name = 'Restaurant' LIMIT 1;
  SELECT id INTO zone_lounge FROM zones WHERE name = 'Lounge' LIMIT 1;
  SELECT id INTO zone_vip FROM zones WHERE name = 'VIP' LIMIT 1;
  SELECT id INTO zone_terrasse FROM zones WHERE name = 'Terrasse' LIMIT 1;

  INSERT INTO restaurant_tables (name, zone_id, capacity, sort_order) VALUES
    ('Table 1', zone_resto, 4, 1),
    ('Table 2', zone_resto, 4, 2),
    ('Table 3', zone_resto, 6, 3),
    ('Table 4', zone_resto, 4, 4),
    ('Lounge 1', zone_lounge, 6, 1),
    ('Lounge 2', zone_lounge, 6, 2),
    ('VIP 1', zone_vip, 8, 1),
    ('VIP 2', zone_vip, 10, 2),
    ('Terrasse 1', zone_terrasse, 4, 1),
    ('Terrasse 2', zone_terrasse, 4, 2),
    ('Terrasse 3', zone_terrasse, 4, 3)
  ON CONFLICT DO NOTHING;
END $$;

-- SEED DATA: Settings
INSERT INTO settings (key, value) VALUES
  ('restaurant_name', 'Le Lounge Bar'),
  ('currency', 'FC'),
  ('receipt_footer', 'Merci de votre visite ! À bientôt.'),
  ('address', '123 Avenue Principale, Kinshasa'),
  ('phone', '+243 XXX XXX XXX')
ON CONFLICT (key) DO NOTHING;
