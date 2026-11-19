-- Source stock and local reservations have different lifetimes. Use the same
-- calculation for supplier polls, order cancellation, trash, and reconciliation.
CREATE FUNCTION supplier_available_inventory(product_key text, local_variants jsonb, source jsonb, ignore_order uuid)
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

CREATE FUNCTION write_order_stock(product_key text, state jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products SET stock=(state->>'stock')::int,status=state->>'status',version=version+1,
    document=document || state || jsonb_build_object('version',version+1), updated_at=now() WHERE id=product_key;
  UPDATE variants v SET stock=(item->>'stock')::int,document=item
    FROM jsonb_array_elements(state->'variants') item WHERE v.product_id=product_key AND v.id=item->>'id';
END $$;

CREATE FUNCTION release_order_allocation(allocation jsonb, ignore_order uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  p products%ROWTYPE;
  source jsonb;
  new_stock integer;
  new_variants jsonb;
BEGIN
  SELECT * INTO p FROM products WHERE id=allocation->>'productId' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT snapshot INTO source FROM supplier_products WHERE product_id=p.id;
  IF FOUND THEN
    PERFORM write_order_stock(p.id,supplier_available_inventory(p.id,p.document->'variants',source,ignore_order));
  ELSE
    new_stock := p.stock+(allocation->>'quantity')::int;
    SELECT coalesce(jsonb_agg(v || jsonb_build_object('stock',CASE WHEN (v->>'stockFromParent')::boolean THEN new_stock
      ELSE (v->>'stock')::int+coalesce((adjustment->>'quantity')::int,0) END) ORDER BY ord),'[]')
      INTO new_variants FROM jsonb_array_elements(p.document->'variants') WITH ORDINALITY AS items(v,ord)
      LEFT JOIN jsonb_array_elements(allocation->'variants') adjustment ON v->>'id'=adjustment->>'id';
    PERFORM write_order_stock(p.id,jsonb_build_object('stock',new_stock,'variants',new_variants,
      'status',CASE WHEN p.status='out-of-stock' AND p.stock=0 AND new_stock>0 THEN 'active' ELSE p.status END));
  END IF;
END $$;

-- Reserve from today's stock when an order is restored, keeping its recorded prices.
CREATE FUNCTION reserve_restored_order(lines jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  group_items record;
  p products%ROWTYPE;
  v jsonb;
  requested record;
  variant_holds jsonb;
  held jsonb := '[]';
  new_stock integer;
  new_variants jsonb;
BEGIN
  FOR group_items IN
    SELECT regexp_replace(line->>'productId','^catalog-(?=[0-9]+(-|$))','raboteb-') AS id,
      sum((line->>'quantity')::int)::int AS quantity,jsonb_agg(line) AS items
    FROM jsonb_array_elements(lines) line GROUP BY 1 ORDER BY 1
  LOOP
    SELECT * INTO p FROM products WHERE id=group_items.id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR p.status<>'active' OR p.stock<group_items.quantity THEN
      RAISE EXCEPTION USING ERRCODE='P0409', MESSAGE='بازیابی سفارش ممکن نیست؛ محصول در دسترس نیست یا موجودی کافی ندارد.';
    END IF;
    variant_holds := '[]';
    FOR requested IN
      SELECT regexp_replace(line->>'variantId','^catalog-(?=[0-9]+(-|$))','raboteb-') AS id,sum((line->>'quantity')::int)::int AS quantity
      FROM jsonb_array_elements(group_items.items) line GROUP BY 1
    LOOP
      IF jsonb_array_length(p.document->'variants')=0 AND requested.id=p.id||'-default' THEN CONTINUE; END IF;
      SELECT item INTO v FROM jsonb_array_elements(p.document->'variants') item WHERE item->>'id'=requested.id;
      IF NOT FOUND OR (v->>'stock')::int<requested.quantity THEN
        RAISE EXCEPTION USING ERRCODE='P0409', MESSAGE='بازیابی سفارش ممکن نیست؛ تنوع محصول حذف شده یا موجودی کافی ندارد.';
      END IF;
      IF v->>'stock' IS NOT NULL AND NOT coalesce((v->>'stockFromParent')::boolean,false) THEN
        variant_holds := variant_holds || jsonb_build_array(jsonb_build_object('id',requested.id,'quantity',requested.quantity));
      END IF;
    END LOOP;
    new_stock := p.stock-group_items.quantity;
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('stock',CASE WHEN (item->>'stockFromParent')::boolean THEN new_stock
      ELSE (item->>'stock')::int-coalesce((hold->>'quantity')::int,0) END) ORDER BY ord),'[]')
      INTO new_variants FROM jsonb_array_elements(p.document->'variants') WITH ORDINALITY AS items(item,ord)
      LEFT JOIN jsonb_array_elements(variant_holds) hold ON hold->>'id'=item->>'id';
    PERFORM write_order_stock(p.id,jsonb_build_object('stock',new_stock,'variants',new_variants,
      'status',CASE WHEN new_stock=0 THEN 'out-of-stock' ELSE p.status END));
    held := held || jsonb_build_array(jsonb_build_object('productId',p.id,
      'quantity',CASE WHEN p.stock IS NULL THEN 0 ELSE group_items.quantity END,'variants',variant_holds));
  END LOOP;
  RETURN held;
END $$;

-- Old installations held stock for soft-deleted orders and purged fulfilled orders.
-- Empty their allocation lists so even a running older polling worker sees no hold.
LOCK TABLE orders, retired_order_inventory IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE allocation jsonb;
BEGIN
  FOR allocation IN
    SELECT a FROM (
      SELECT document->'inventory' AS holds FROM orders WHERE deleted_at IS NOT NULL AND status<>'cancelled'
      UNION ALL SELECT inventory FROM retired_order_inventory
    ) archived CROSS JOIN LATERAL jsonb_array_elements(holds) a ORDER BY a->>'productId'
  LOOP
    PERFORM release_order_allocation(allocation,NULL);
  END LOOP;
  UPDATE orders SET document=document || jsonb_build_object('inventory','[]'::jsonb,'version',version+1),
    version=version+1,updated_at=now() WHERE deleted_at IS NOT NULL AND jsonb_array_length(document->'inventory')>0;
  DELETE FROM retired_order_inventory;
END $$;

CREATE FUNCTION order_trash_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation jsonb;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    IF OLD.status<>'cancelled' THEN
      FOR allocation IN SELECT a FROM jsonb_array_elements(OLD.document->'inventory') a ORDER BY a->>'productId' LOOP
        PERFORM release_order_allocation(allocation,OLD.id);
      END LOOP;
    END IF;
    NEW.document := NEW.document || jsonb_build_object('inventory','[]'::jsonb);
  ELSIF NEW.status<>'cancelled' THEN
    NEW.document := NEW.document || jsonb_build_object('inventory',reserve_restored_order(NEW.document->'items'));
  END IF;
  NEW.document := NEW.document || jsonb_build_object('version',NEW.version);
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER order_trash_stock_transition BEFORE UPDATE OF deleted_at ON orders
  FOR EACH ROW WHEN ((OLD.deleted_at IS NULL) <> (NEW.deleted_at IS NULL)) EXECUTE FUNCTION order_trash_stock();
