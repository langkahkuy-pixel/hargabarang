-- Apply once to an empty MariaDB database using a migration account.
CREATE TABLE categories (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  category_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  name VARCHAR(100) NOT NULL CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  brand VARCHAR(80) NOT NULL DEFAULT '',
  variant VARCHAR(80) NOT NULL DEFAULT '',
  unit VARCHAR(40) NOT NULL CHECK (CHAR_LENGTH(TRIM(unit)) > 0),
  sku VARCHAR(60) NULL CHECK (sku IS NULL OR CHAR_LENGTH(TRIM(sku)) > 0),
  aliases JSON NOT NULL CHECK (JSON_TYPE(aliases) = 'ARRAY'),
  sale_price DECIMAL(12,2) NOT NULL CHECK (sale_price >= 0),
  cost_price DECIMAL(12,2) NULL CHECK (cost_price >= 0),
  stock_qty DECIMAL(12,2) NULL CHECK (stock_qty >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE CHECK (is_active IN (0, 1)),
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  updated_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  deleted_at DATETIME(3) NULL,
  live_sku VARCHAR(60) AS (IF(deleted_at IS NULL, sku, NULL)) PERSISTENT,
  UNIQUE KEY products_live_sku (live_sku),
  KEY products_visible (deleted_at, is_active),
  CONSTRAINT products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE price_history (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  product_label VARCHAR(270) NOT NULL,
  old_price DECIMAL(12,2) NOT NULL CHECK (old_price >= 0),
  new_price DECIMAL(12,2) NOT NULL CHECK (new_price >= 0),
  changed_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  KEY price_history_time (changed_at, id),
  KEY price_history_product_time (product_id, changed_at, id),
  CONSTRAINT price_history_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_pin_attempts (
  id TINYINT UNSIGNED PRIMARY KEY CHECK (id = 1),
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  window_ends_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

INSERT INTO admin_pin_attempts (id, window_ends_at) VALUES (1, '1970-01-01 00:00:00');

CREATE TRIGGER products_version BEFORE UPDATE ON products FOR EACH ROW
  SET NEW.updated_at = UTC_TIMESTAMP(3), NEW.revision = OLD.revision + 1;

CREATE TRIGGER products_price_audit AFTER UPDATE ON products FOR EACH ROW
  INSERT INTO price_history (id, product_id, product_label, old_price, new_price)
  SELECT UUID(), NEW.id, CONCAT_WS(' ', NEW.name, NULLIF(NEW.brand, ''), NULLIF(NEW.variant, '')),
    OLD.sale_price, NEW.sale_price
  WHERE OLD.sale_price <> NEW.sale_price;
