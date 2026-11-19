CREATE TABLE animation_builds (
  id uuid PRIMARY KEY,
  fingerprint text NOT NULL,
  document jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES admins(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(created_by, fingerprint)
);
