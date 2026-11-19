ALTER TABLE analysis_submissions ADD COLUMN deleted_at timestamptz;
CREATE INDEX analysis_trash ON analysis_submissions(deleted_at DESC) WHERE deleted_at IS NOT NULL;
