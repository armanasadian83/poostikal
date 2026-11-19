ALTER TABLE support_threads ADD COLUMN like_version bigint NOT NULL DEFAULT 0;

ALTER TABLE support_messages
  ADD COLUMN sticker_id text,
  ADD COLUMN reply_to bigint,
  ADD COLUMN like_version bigint NOT NULL DEFAULT 0,
  ADD UNIQUE (thread_id, id),
  ADD FOREIGN KEY (thread_id, reply_to) REFERENCES support_messages(thread_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX support_changed_likes ON support_messages(thread_id, like_version) WHERE like_version > 0;

CREATE TABLE support_message_likes (
  message_id bigint NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
  actor text NOT NULL,
  PRIMARY KEY (message_id, actor)
);
