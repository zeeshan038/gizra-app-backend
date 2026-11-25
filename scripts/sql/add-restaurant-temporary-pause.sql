-- Early Close / Temporary Restaurant Pause (nullable). Idempotent for deploy schema patches.
ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "paused_until" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "pause_message" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "pause_type" VARCHAR(32);
