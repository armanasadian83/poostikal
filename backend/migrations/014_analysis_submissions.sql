CREATE TABLE analysis_submissions (
  id uuid PRIMARY KEY,
  request_hash text NOT NULL,
  client_ref text NOT NULL,
  client_name text NOT NULL,
  phone text NOT NULL,
  answers jsonb NOT NULL,
  photo bytea CHECK (photo IS NULL OR octet_length(photo) BETWEEN 1 AND 1999999),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','guided','reviewed')),
  guidance text,
  review_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analysis_created ON analysis_submissions(created_at DESC, id);
CREATE INDEX analysis_review ON analysis_submissions(status, created_at DESC);
CREATE INDEX analysis_client ON analysis_submissions(client_ref, created_at DESC);
CREATE INDEX analysis_phone ON analysis_submissions(phone) WHERE phone <> '';
