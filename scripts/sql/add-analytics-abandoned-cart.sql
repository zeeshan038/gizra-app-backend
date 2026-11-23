-- User behavior analytics + abandoned cart recovery (WhatsApp webhook later via env)
CREATE TABLE IF NOT EXISTS user_analytics_events (
  id             BIGSERIAL PRIMARY KEY,
  user_id        DECIMAL,
  guest_id       DECIMAL,
  is_guest       BOOLEAN NOT NULL DEFAULT FALSE,
  event_name     VARCHAR(64) NOT NULL,
  client_session VARCHAR(128),
  restaurant_id  DECIMAL,
  zone_id        DECIMAL,
  properties     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_analytics_events_name_created_idx
  ON user_analytics_events (event_name, created_at);
CREATE INDEX IF NOT EXISTS user_analytics_events_user_created_idx
  ON user_analytics_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS user_analytics_events_created_idx
  ON user_analytics_events (created_at);

CREATE TABLE IF NOT EXISTS abandoned_cart_sessions (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              DECIMAL NOT NULL,
  restaurant_id        DECIMAL,
  restaurant_name      VARCHAR(255),
  zone_id              DECIMAL,
  status               VARCHAR(32) NOT NULL DEFAULT 'active',
  last_activity_at     TIMESTAMPTZ NOT NULL,
  abandoned_at         TIMESTAMPTZ,
  recovered_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  recovered_order_id   DECIMAL,
  customer_name        VARCHAR(255),
  customer_phone       VARCHAR(64),
  cart_total           DOUBLE PRECISION NOT NULL DEFAULT 0,
  cart_snapshot        TEXT,
  deeplink             VARCHAR(512),
  whatsapp_status      VARCHAR(32) NOT NULL DEFAULT 'pending',
  whatsapp_sent_at     TIMESTAMPTZ,
  whatsapp_attempts    INT NOT NULL DEFAULT 0,
  whatsapp_last_error  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS abandoned_cart_sessions_status_activity_idx
  ON abandoned_cart_sessions (status, last_activity_at);
CREATE INDEX IF NOT EXISTS abandoned_cart_sessions_user_status_idx
  ON abandoned_cart_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS abandoned_cart_sessions_wa_idx
  ON abandoned_cart_sessions (whatsapp_status, abandoned_at);
