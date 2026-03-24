-- Add user rating column to model_runs.
-- 1 = thumbs up, -1 = thumbs down, NULL = no rating.
ALTER TABLE model_runs
  ADD COLUMN IF NOT EXISTS rating smallint
  CHECK (rating IN (-1, 1));

COMMENT ON COLUMN model_runs.rating IS
  '1 = thumbs up, -1 = thumbs down, NULL = no rating';
