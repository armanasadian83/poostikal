-- Images have a seven-day lifetime. Only the review decision belongs to order history.
CREATE TABLE receipt_reviews (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK(amount >= 0),
  status text NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')),
  rejection_reason text, uploaded_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  reviewed_at timestamptz, reviewed_by uuid REFERENCES admins(id) ON DELETE SET NULL
);
INSERT INTO receipt_reviews (id,order_id,amount,status,uploaded_at,expires_at,reviewed_at,reviewed_by)
SELECT r.id,r.order_id,r.amount,CASE WHEN o.status='cancelled' THEN 'cancelled' ELSE r.status END,
       r.uploaded_at,r.expires_at,r.reviewed_at,r.reviewed_by
  FROM payment_receipts r JOIN orders o ON o.id=r.order_id;
CREATE UNIQUE INDEX receipt_reviews_one_pending ON receipt_reviews(order_id) WHERE status='pending';
CREATE INDEX receipt_reviews_history ON receipt_reviews(order_id,uploaded_at DESC,id);
CREATE INDEX receipt_reviews_queue ON receipt_reviews(uploaded_at DESC,id);
-- The binary table only handles retention from now on. Decisions live in receipt_reviews.
DROP INDEX payment_receipts_one_pending;
ALTER TABLE payment_receipts DROP COLUMN status, DROP COLUMN reviewed_by, DROP COLUMN reviewed_at;
CREATE FUNCTION cancel_order_receipts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE receipt_reviews SET status='cancelled' WHERE order_id=NEW.id AND status<>'cancelled';
  RETURN NEW;
END $$;
CREATE TRIGGER cancel_payment_receipts AFTER UPDATE OF status ON orders FOR EACH ROW
WHEN (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION cancel_order_receipts();
CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_address_book ON customer_addresses(customer_id,created_at);
CREATE INDEX IF NOT EXISTS customer_dashboard_orders ON orders(customer_id,created_at DESC,number DESC) WHERE deleted_at IS NULL;
