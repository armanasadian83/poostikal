CREATE TABLE customer_baskets (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) <= 100),
  CHECK ((lines = '[]'::jsonb) = (expires_at IS NULL))
);

CREATE INDEX customer_baskets_expiry ON customer_baskets(expires_at)
  WHERE expires_at IS NOT NULL;
