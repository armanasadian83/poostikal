CREATE TABLE support_threads (
  id uuid PRIMARY KEY,
  customer_id uuid UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  guest_hash text UNIQUE,
  guest_expires_at timestamptz,
  phone text NOT NULL,
  last_message_id bigint,
  CHECK ((customer_id IS NOT NULL AND guest_hash IS NULL AND guest_expires_at IS NULL)
      OR (customer_id IS NULL AND guest_hash IS NOT NULL AND guest_expires_at IS NOT NULL))
);

CREATE TABLE support_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('customer', 'staff')),
  client_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (thread_id, sender, client_id)
);

CREATE INDEX support_messages_history ON support_messages(thread_id, id DESC);
CREATE INDEX support_inbox_recent ON support_threads(last_message_id DESC) WHERE last_message_id IS NOT NULL;
