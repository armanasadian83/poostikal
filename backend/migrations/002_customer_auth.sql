CREATE TABLE otp_challenges(phone text PRIMARY KEY, code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL);
CREATE INDEX otp_expiry ON otp_challenges(expires_at);
CREATE TABLE customer_sessions(token_hash text PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE INDEX customer_sessions_expiry ON customer_sessions(expires_at);
