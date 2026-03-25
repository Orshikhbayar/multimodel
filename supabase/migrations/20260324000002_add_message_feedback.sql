-- Add per-message feedback columns.
-- feedback: 1 = positive, -1 = negative, NULL = no feedback

ALTER TABLE model_runs
  ADD COLUMN IF NOT EXISTS feedback SMALLINT DEFAULT NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS feedback SMALLINT DEFAULT NULL;
