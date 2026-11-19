CREATE TABLE shipping_methods (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '',
  type text NOT NULL CHECK(type IN ('flat','collect')),
  fee bigint NOT NULL DEFAULT 0 CHECK(fee BETWEEN 0 AND 1000000000),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(type <> 'collect' OR fee = 0)
);
CREATE INDEX shipping_methods_active_sort ON shipping_methods(active,sort_order,created_at);
ALTER TABLE orders ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN number bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE orders ADD COLUMN request_id uuid UNIQUE;
ALTER TABLE orders ADD COLUMN request_hash text;
ALTER TABLE orders ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
