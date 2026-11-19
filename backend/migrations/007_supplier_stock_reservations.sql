CREATE INDEX orders_supplier_inventory ON orders
USING gin ((document->'inventory') jsonb_path_ops) WHERE status <> 'cancelled';
