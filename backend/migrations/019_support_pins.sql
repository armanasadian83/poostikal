ALTER TABLE support_threads ADD COLUMN pinned boolean NOT NULL DEFAULT false;

CREATE INDEX support_inbox_pinned_recent ON support_threads (pinned DESC, last_message_id DESC)
  WHERE last_message_id IS NOT NULL;
DROP INDEX support_inbox_recent;
