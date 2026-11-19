-- Existing customer identities keep their IDs and associations. A local test PIN
-- must never authenticate the SMS identity with the same mobile number.
ALTER TABLE customers ADD COLUMN local_test boolean NOT NULL DEFAULT false;
ALTER TABLE customers DROP CONSTRAINT customers_phone_key,
  ADD CONSTRAINT customers_phone_identity_key UNIQUE (phone, local_test);
