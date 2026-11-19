CREATE TABLE payment_receipts (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK(amount >= 0),
  image bytea NOT NULL CHECK(octet_length(image) BETWEEN 1 AND 1999999),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX payment_receipts_expiry ON payment_receipts(expires_at);
CREATE INDEX payment_receipts_queue ON payment_receipts(uploaded_at DESC, id);
CREATE INDEX payment_receipts_order ON payment_receipts(order_id, uploaded_at DESC);
CREATE UNIQUE INDEX payment_receipts_one_pending ON payment_receipts(order_id) WHERE status='pending';
