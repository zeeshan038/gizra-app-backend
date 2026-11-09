-- Emergency service pause (super admin): per-region and master pause switches
CREATE TABLE "emergency_service_pause_configs" (
    "id" BIGSERIAL NOT NULL,
    "pause_all" BOOLEAN NOT NULL DEFAULT false,
    "pause_gush_etzion" BOOLEAN NOT NULL DEFAULT false,
    "pause_kiryat_arba_hebron" BOOLEAN NOT NULL DEFAULT false,
    "notice_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "updated_by_admin_id" BIGINT,

    CONSTRAINT "emergency_service_pause_configs_pkey" PRIMARY KEY ("id")
);

INSERT INTO "emergency_service_pause_configs" (
  "pause_all",
  "pause_gush_etzion",
  "pause_kiryat_arba_hebron",
  "notice_message",
  "created_at",
  "updated_at"
)
VALUES (false, false, false, NULL, NOW(), NOW());
