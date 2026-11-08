-- Admin-facing reason shown to customers when delivery is blocked during distance restriction.
ALTER TABLE "delivery_distance_time_restriction_configs"
  ADD COLUMN IF NOT EXISTS "description" VARCHAR(1000);
