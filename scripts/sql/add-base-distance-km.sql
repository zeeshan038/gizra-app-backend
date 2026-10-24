-- Tiered delivery pricing (zone + restaurant). Safe to re-run.
ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS base_distance_km double precision DEFAULT 2;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS base_distance_km double precision DEFAULT 2;

UPDATE zones SET base_distance_km = 2 WHERE base_distance_km IS NULL;
UPDATE restaurants SET base_distance_km = 2 WHERE base_distance_km IS NULL;
