ALTER TABLE supplier_jobs ADD COLUMN discover_products boolean NOT NULL DEFAULT false;

-- Every sync performed before this migration read the full source catalog.
UPDATE supplier_jobs SET discover_products = true WHERE kind = 'sync';

CREATE INDEX supplier_sync_finished ON supplier_jobs (finished_at DESC)
  WHERE kind = 'sync' AND finished_at IS NOT NULL;
CREATE INDEX supplier_discovery_finished ON supplier_jobs (finished_at DESC)
  WHERE discover_products AND finished_at IS NOT NULL;
