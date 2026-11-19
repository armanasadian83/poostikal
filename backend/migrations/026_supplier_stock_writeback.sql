-- Outbox targets are immutable snapshots of order allocations. The worker
-- freezes the corresponding remote request before sending it, so timeouts and
-- crashes can replay the same operation ID and contents.
CREATE TABLE supplier_stock_outbox (
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_version integer NOT NULL CHECK (order_version > 0),
  inventory jsonb NOT NULL CHECK (jsonb_typeof(inventory)='array'),
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines)='array'),
  payload jsonb CHECK (payload IS NULL OR jsonb_typeof(payload)='object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (order_id,order_version)
);

CREATE INDEX supplier_stock_outbox_pending ON supplier_stock_outbox(sequence) WHERE status='pending';
CREATE INDEX supplier_stock_outbox_order_sequence ON supplier_stock_outbox(order_id,sequence DESC);

-- The row survives local order deletion. The remote release can still be
-- replayed if a trashed order is permanently removed before synchronization.
CREATE TABLE supplier_order_stock (
  order_id uuid PRIMARY KEY,
  inventory jsonb NOT NULL CHECK (jsonb_typeof(inventory)='array'),
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines)='array'),
  operation_id uuid NOT NULL REFERENCES supplier_stock_outbox(operation_id),
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION enqueue_supplier_order_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  desired_inventory jsonb := '[]';
  desired_lines jsonb := '[]';
  previous_target supplier_stock_outbox%ROWTYPE;
  reopening boolean := false;
BEGIN
  IF NEW.document->'supplierStockBridge' IS DISTINCT FROM 'true'::jsonb THEN
    RETURN NULL;
  END IF;

  IF NEW.deleted_at IS NULL AND NEW.status <> 'cancelled' THEN
    IF TG_OP='UPDATE' THEN reopening := OLD.deleted_at IS NOT NULL OR OLD.status='cancelled'; END IF;
    SELECT coalesce(jsonb_agg(allocation ORDER BY allocation->>'productId'),'[]')
      INTO desired_inventory
    FROM jsonb_array_elements(coalesce(NEW.document->'inventory','[]')) allocation
    JOIN supplier_products supplier ON supplier.product_id=allocation->>'productId';

    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'productId',regexp_replace(line->>'productId','^raboteb-(?=[0-9]+(-|$))','catalog-'),
        'variantId',regexp_replace(line->>'variantId','^raboteb-(?=[0-9]+(-|$))','catalog-'),
        'quantity',line->'quantity',
        'unitPriceToman',line->'unitPriceToman'
      ) ORDER BY supplier.source_id,line->>'variantId'),'[]') INTO desired_lines
    FROM jsonb_array_elements(coalesce(NEW.document->'items','[]')) line
    JOIN supplier_products supplier
      ON supplier.product_id=regexp_replace(line->>'productId','^catalog-(?=[0-9]+(-|$))','raboteb-');
  END IF;

  SELECT * INTO previous_target FROM supplier_stock_outbox
    WHERE order_id=NEW.id ORDER BY sequence DESC LIMIT 1;
  IF NOT FOUND THEN
    IF desired_lines='[]' THEN RETURN NULL; END IF;
  ELSIF previous_target.inventory=desired_inventory AND previous_target.lines=desired_lines
    AND NOT (reopening AND previous_target.status='rejected') THEN
    RETURN NULL;
  ELSIF desired_lines='[]' AND previous_target.status='rejected' AND NOT EXISTS (
    SELECT 1 FROM supplier_order_stock WHERE order_id=NEW.id
  ) THEN
    -- The supplier definitively refused the original purchase. There is nothing
    -- to restore remotely when the local order is subsequently cancelled.
    RETURN NULL;
  END IF;

  INSERT INTO supplier_stock_outbox(order_id,order_version,inventory,lines)
    VALUES(NEW.id,NEW.version,desired_inventory,desired_lines);
  RETURN NULL;
END $$;

CREATE TRIGGER enqueue_supplier_order_stock AFTER INSERT OR UPDATE OF document,status,deleted_at ON orders
  FOR EACH ROW EXECUTE FUNCTION enqueue_supplier_order_stock();

-- The source snapshot includes acknowledged remote deductions. Subtract only
-- local quantities the source has not accounted for yet. Every acknowledgement
-- must commit its fresh source snapshot(s) and supplier_order_stock together.
CREATE OR REPLACE FUNCTION supplier_available_inventory(product_key text, local_variants jsonb, source jsonb, ignore_order uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH reservations AS MATERIALIZED (
    SELECT allocation, acknowledged.applied
    FROM orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.document->'inventory') allocation
    LEFT JOIN supplier_order_stock mirrored ON mirrored.order_id=o.id
    LEFT JOIN LATERAL (
      SELECT item AS applied FROM jsonb_array_elements(mirrored.inventory) item
      WHERE item->>'productId'=product_key
    ) acknowledged ON true
    WHERE o.deleted_at IS NULL AND o.status <> 'cancelled' AND o.id IS DISTINCT FROM ignore_order
      AND o.document->'inventory' @> jsonb_build_array(jsonb_build_object('productId',product_key))
      AND allocation->>'productId'=product_key
  ), variant_reservations AS (
    SELECT wanted->>'id' AS id, sum(greatest(0,
      (wanted->>'quantity')::int - coalesce((already->>'quantity')::int,0))) AS quantity
    FROM reservations
    CROSS JOIN LATERAL jsonb_array_elements(allocation->'variants') wanted
    LEFT JOIN LATERAL jsonb_array_elements(applied->'variants') already ON already->>'id'=wanted->>'id'
    GROUP BY 1
  ), raw_variants AS (
    SELECT 'raboteb-'||(v->>'id') AS id, (v->>'stockFromParent')::boolean AS shared,
      CASE WHEN (v->>'inStock')::boolean THEN (v->>'stock')::int ELSE 0 END AS stock
    FROM jsonb_array_elements(source->'variants') v
  ), source_total AS (
    SELECT CASE WHEN NOT (source->>'inStock')::boolean THEN 0
      WHEN source->>'stock' IS NOT NULL THEN (source->>'stock')::int
      WHEN count(*)>0 AND count(stock)=count(*) THEN sum(stock) END AS stock FROM raw_variants
  ), available AS (
    SELECT CASE WHEN stock IS NOT NULL THEN greatest(0,stock-coalesce((
      SELECT sum(greatest(0,(allocation->>'quantity')::int - coalesce((applied->>'quantity')::int,0)))
      FROM reservations),0)) END AS stock
    FROM source_total
  ), projected AS (
    SELECT v AS variant, ord, CASE
      WHEN raw.id IS NULL OR NOT (source->>'inStock')::boolean THEN 0
      WHEN raw.shared THEN available.stock
      WHEN raw.stock IS NOT NULL THEN greatest(0,raw.stock-coalesce(r.quantity,0)) END AS stock
    FROM jsonb_array_elements(local_variants) WITH ORDINALITY AS items(v,ord)
    CROSS JOIN available LEFT JOIN raw_variants raw ON raw.id=v->>'id'
    LEFT JOIN variant_reservations r ON r.id=raw.id
  )
  SELECT jsonb_build_object('stock',available.stock,'variants',
    coalesce((SELECT jsonb_agg(variant || jsonb_build_object('stock',stock) ORDER BY ord) FROM projected),'[]'::jsonb),
    'status',CASE WHEN NOT (source->>'published')::boolean OR NOT (source->>'inStock')::boolean OR available.stock=0
      OR (source->>'type'='variable' AND NOT EXISTS(SELECT 1 FROM projected WHERE stock IS DISTINCT FROM 0 AND (variant->>'priceToman')::bigint>0))
      THEN 'out-of-stock' ELSE 'active' END)
  FROM available
$$;
