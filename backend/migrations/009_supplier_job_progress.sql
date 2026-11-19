ALTER TABLE supplier_jobs ADD COLUMN progress jsonb NOT NULL DEFAULT '{}';
ALTER TABLE supplier_jobs ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE supplier_jobs SET updated_at=coalesce(finished_at,created_at);
