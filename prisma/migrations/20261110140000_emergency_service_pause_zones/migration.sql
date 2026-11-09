CREATE TABLE "emergency_service_pause_zones" (
    "id" BIGSERIAL NOT NULL,
    "config_id" BIGINT NOT NULL,
    "zone_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6),

    CONSTRAINT "emergency_service_pause_zones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emergency_pause_config_zone_unique" ON "emergency_service_pause_zones"("config_id", "zone_id");
CREATE INDEX "emergency_pause_zone_id_idx" ON "emergency_service_pause_zones"("zone_id");

ALTER TABLE "emergency_service_pause_zones" ADD CONSTRAINT "emergency_service_pause_zones_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "emergency_service_pause_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy per-region booleans → junction rows
INSERT INTO "emergency_service_pause_zones" ("config_id", "zone_id", "created_at")
SELECT c.id, z.id, NOW()
FROM "emergency_service_pause_configs" c
JOIN "zones" z ON z.name = 'gush'
WHERE c.pause_gush_etzion = true
  AND NOT EXISTS (
    SELECT 1 FROM "emergency_service_pause_zones" e
    WHERE e.config_id = c.id AND e.zone_id = z.id
  );

INSERT INTO "emergency_service_pause_zones" ("config_id", "zone_id", "created_at")
SELECT c.id, z.id, NOW()
FROM "emergency_service_pause_configs" c
JOIN "zones" z ON z.name = 'hebron'
WHERE c.pause_kiryat_arba_hebron = true
  AND NOT EXISTS (
    SELECT 1 FROM "emergency_service_pause_zones" e
    WHERE e.config_id = c.id AND e.zone_id = z.id
  );
