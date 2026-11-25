-- Third-party POS integration: extend legacy partner_* tables
ALTER TABLE partner_api_keys
  ADD COLUMN IF NOT EXISTS environment VARCHAR(16) NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS provider VARCHAR(64) NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(32),
  ADD COLUMN IF NOT EXISTS token_encrypted TEXT;

ALTER TABLE partner_webhooks
  ADD COLUMN IF NOT EXISTS provider VARCHAR(64) NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS external_merchant_id VARCHAR(128);

ALTER TABLE partner_webhook_deliveries
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS event_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS response_body TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS partner_webhook_deliveries_event_id_unique
  ON partner_webhook_deliveries (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS partner_webhook_deliveries_next_attempt_idx
  ON partner_webhook_deliveries (next_attempt_at)
  WHERE delivered_at IS NULL AND given_up_at IS NULL;
