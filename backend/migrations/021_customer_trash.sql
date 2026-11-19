ALTER TABLE customers ADD COLUMN deleted_at timestamptz;
ALTER TABLE customers DROP CONSTRAINT customers_phone_identity_key;
CREATE UNIQUE INDEX customers_live_phone_identity ON customers(phone, local_test) WHERE deleted_at IS NULL;
