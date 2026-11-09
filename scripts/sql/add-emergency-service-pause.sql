-- Emergency service pause (super admin). Idempotent for deploy schema patches.
CREATE TABLE IF NOT EXISTS emergency_service_pause_configs (
  id BIGSERIAL NOT NULL,
  pause_all BOOLEAN NOT NULL DEFAULT false,
  pause_gush_etzion BOOLEAN NOT NULL DEFAULT false,
  pause_kiryat_arba_hebron BOOLEAN NOT NULL DEFAULT false,
  notice_message VARCHAR(1000),
  created_at TIMESTAMPTZ(6),
  updated_at TIMESTAMPTZ(6),
  updated_by_admin_id BIGINT,
  CONSTRAINT emergency_service_pause_configs_pkey PRIMARY KEY (id)
);

INSERT INTO emergency_service_pause_configs (
  pause_all,
  pause_gush_etzion,
  pause_kiryat_arba_hebron,
  notice_message,
  created_at,
  updated_at
)
SELECT false, false, false, NULL, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM emergency_service_pause_configs);
