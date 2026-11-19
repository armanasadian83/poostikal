ALTER TABLE media ADD COLUMN duration_seconds double precision;
ALTER TABLE media ADD CONSTRAINT media_audio_duration CHECK (duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 91));
