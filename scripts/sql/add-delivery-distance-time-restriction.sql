-- Time-based delivery distance restriction (super admin). Idempotent for deploy schema patches.
-- See prisma/migrations/20251106140000_delivery_distance_time_restriction/migration.sql

CREATE TABLE IF NOT EXISTS delivery_distance_time_restriction_configs (
  id BIGSERIAL NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  max_distance_km DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  start_time VARCHAR(16) NOT NULL DEFAULT '16:30',
  end_time VARCHAR(16) NOT NULL DEFAULT '20:30',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jerusalem',
  created_at TIMESTAMPTZ(6),
  updated_at TIMESTAMPTZ(6),
  updated_by_admin_id BIGINT,
  CONSTRAINT delivery_distance_time_restriction_configs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS delivery_distance_time_restriction_restaurants (
  id BIGSERIAL NOT NULL,
  config_id BIGINT NOT NULL,
  restaurant_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ(6),
  CONSTRAINT delivery_distance_time_restriction_restaurants_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_dtr_config_restaurant_unique
  ON delivery_distance_time_restriction_restaurants (config_id, restaurant_id);

CREATE INDEX IF NOT EXISTS delivery_dtr_restaurant_id_idx
  ON delivery_distance_time_restriction_restaurants (restaurant_id);

DO $$
BEGIN
  ALTER TABLE delivery_distance_time_restriction_restaurants
    ADD CONSTRAINT delivery_distance_time_restriction_restaurants_config_id_fkey
    FOREIGN KEY (config_id) REFERENCES delivery_distance_time_restriction_configs (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO delivery_distance_time_restriction_configs (
  enabled,
  max_distance_km,
  start_time,
  end_time,
  timezone,
  created_at,
  updated_at
)
SELECT false, 10.00, '16:30', '20:30', 'Asia/Jerusalem', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM delivery_distance_time_restriction_configs);
