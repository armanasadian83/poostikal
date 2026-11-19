ALTER TABLE products ALTER COLUMN stock DROP NOT NULL;
ALTER TABLE variants ALTER COLUMN stock DROP NOT NULL;
CREATE TABLE supplier_products (
  source_id bigint PRIMARY KEY,
  product_id text UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE supplier_media (
  source_url text PRIMARY KEY,
  media_id uuid NOT NULL REFERENCES media(id),
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE supplier_jobs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('csv','sync')),
  status text NOT NULL CHECK(status IN ('queued','running','complete','partial','failed')),
  admin_id uuid REFERENCES admins(id),
  payload jsonb NOT NULL DEFAULT '[]',
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  imported integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX supplier_one_active_job ON supplier_jobs ((1)) WHERE status IN ('queued','running');
CREATE INDEX supplier_jobs_created ON supplier_jobs(created_at DESC);
