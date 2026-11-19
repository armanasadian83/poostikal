-- Keep migration 026 in the journal. This reversal requires a bridge that
-- never accepted orders or sent any inventory changes to the supplier.
LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE supplier_order_stock, supplier_stock_outbox IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supplier_stock_outbox)
    OR EXISTS (SELECT 1 FROM supplier_order_stock)
    OR EXISTS (SELECT 1 FROM orders WHERE document->'supplierStockBridge'='true'::jsonb)
  THEN
    RAISE EXCEPTION 'Cannot remove Raboteb stock writeback with recorded activity. Reconcile the affected orders first.';
  END IF;
END $$;

DROP TRIGGER enqueue_supplier_order_stock ON orders;
DROP FUNCTION enqueue_supplier_order_stock();

-- Restore the original one-way stock projection from migration 015.
CREATE OR REPLACE FUNCTION supplier_available_inventory(product_key text, local_variants jsonb, source jsonb, ignore_order uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH reservations AS MATERIALIZED (
    SELECT allocation
    FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.document->'inventory') allocation
    WHERE o.deleted_at IS NULL AND o.status <> 'cancelled' AND o.id IS DISTINCT FROM ignore_order
      AND o.document->'inventory' @> jsonb_build_array(jsonb_build_object('productId',product_key))
      AND allocation->>'productId'=product_key
  ), variant_reservations AS (
    SELECT v->>'id' AS id,sum((v->>'quantity')::int) AS quantity
    FROM reservations CROSS JOIN LATERAL jsonb_array_elements(allocation->'variants') v GROUP BY 1
  ), raw_variants AS (
    SELECT 'raboteb-'||(v->>'id') AS id, (v->>'stockFromParent')::boolean AS shared,
      CASE WHEN (v->>'inStock')::boolean THEN (v->>'stock')::int ELSE 0 END AS stock
    FROM jsonb_array_elements(source->'variants') v
  ), source_total AS (
    SELECT CASE WHEN NOT (source->>'inStock')::boolean THEN 0
      WHEN source->>'stock' IS NOT NULL THEN (source->>'stock')::int
      WHEN count(*)>0 AND count(stock)=count(*) THEN sum(stock) END AS stock FROM raw_variants
  ), available AS (
    SELECT CASE WHEN stock IS NOT NULL THEN greatest(0,stock-coalesce((SELECT sum((allocation->>'quantity')::int) FROM reservations),0)) END AS stock
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

DROP TABLE supplier_order_stock;
DROP TABLE supplier_stock_outbox;
