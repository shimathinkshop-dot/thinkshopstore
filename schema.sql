CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  image TEXT DEFAULT '',
  desc TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'فروشگاه',
  featured INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  rating TEXT NOT NULL DEFAULT '۵.۰',
  reviews TEXT NOT NULL DEFAULT '۰',
  cover TEXT DEFAULT 'ThinkShop',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_best ON products(best);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO settings(key,value) VALUES ('gateway','{}');
