-- One POS credential per restaurant: hold both sandbox + live tokens on the same row.

ALTER TABLE partner_api_keys
  ADD COLUMN IF NOT EXISTS sandbox_key_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS sandbox_secret_hash TEXT,
  ADD COLUMN IF NOT EXISTS sandbox_key_prefix VARCHAR(32),
  ADD COLUMN IF NOT EXISTS sandbox_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS live_key_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS live_secret_hash TEXT,
  ADD COLUMN IF NOT EXISTS live_key_prefix VARCHAR(32),
  ADD COLUMN IF NOT EXISTS live_token_encrypted TEXT;

-- Backfill dual columns from legacy single-environment rows
UPDATE partner_api_keys
SET
  sandbox_key_id = COALESCE(sandbox_key_id, key_id),
  sandbox_secret_hash = COALESCE(sandbox_secret_hash, secret_hash),
  sandbox_key_prefix = COALESCE(sandbox_key_prefix, key_prefix),
  sandbox_token_encrypted = COALESCE(sandbox_token_encrypted, token_encrypted)
WHERE lower(coalesce(environment, '')) = 'sandbox';

UPDATE partner_api_keys
SET
  live_key_id = COALESCE(live_key_id, key_id),
  live_secret_hash = COALESCE(live_secret_hash, secret_hash),
  live_key_prefix = COALESCE(live_key_prefix, key_prefix),
  live_token_encrypted = COALESCE(live_token_encrypted, token_encrypted)
WHERE lower(coalesce(environment, '')) = 'live'
   OR (environment IS NULL OR environment = '');

-- Merge duplicate restaurant rows into the newest (max id)
WITH ranked AS (
  SELECT
    id,
    restaurant_id,
    ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY id DESC) AS rn
  FROM partner_api_keys
  WHERE revoked_at IS NULL
),
keepers AS (
  SELECT id, restaurant_id FROM ranked WHERE rn = 1
),
merged AS (
  SELECT
    k.id AS keep_id,
    k.restaurant_id,
    (
      SELECT p.sandbox_key_id FROM partner_api_keys p
      WHERE p.restaurant_id = k.restaurant_id AND p.sandbox_key_id IS NOT NULL
      ORDER BY p.id DESC LIMIT 1
    ) AS sandbox_key_id,
    (
      SELECT p.sandbox_secret_hash FROM partner_api_keys p
      WHERE p.restaurant_id = k.restaurant_id AND p.sandbox_secret_hash IS NOT NULL
      ORDER BY p.id DESC LIMIT 1
    ) AS sandbox_secret_hash,
    (
      SELECT p.sandbox_key_prefix FROM partner_api_keys p
      WHERE p.restaurant_id = k.restaurant_id AND p.sandbox_key_prefix IS NOT NULL
      ORDER BY p.id DESC LIMIT 1
    ) AS sandbox_key_prefix,
    (
      SELECT p.sandbox_token_encrypted FROM partner_api_keys p
      WHERE p.restaurant_id = k.restaurant_id AND p.sandbox_token_encrypted IS NOT NULL
      ORDER BY p.id DESC LIMIT 1
    ) AS sandbox_token_encrypted,
    (
      SELECT p.live_key_id FROM partner_api_keys p
      WHERE p.restaurant_id = k.restaurant_id AND p.live_key_id IS NOT NULL
      ORDER BY p.id DESC LIMIT 1
    ) AS live_key_id,
    (
      SELECT p.live_secret_hash FROM partner_api_keys p
      WHERE p.restaurant_id = k.restaurant_id AND p.live_secret_hash IS NOT NULL
      ORDER BY p.id DESC LIMIT 1
    ) AS live_secret_hash,
    (
      SELECT p.live_key_prefix FROM partner_api_keys p
      WHERE p.restaurant_id = k.restaurant_id AND p.live_key_prefix IS NOT NULL
      ORDER BY p.id DESC LIMIT 1
    ) AS live_key_prefix,
    (
      SELECT p.live_token_encrypted FROM partner_api_keys p
      WHERE p.restaurant_id = k.restaurant_id AND p.live_token_encrypted IS NOT NULL
      ORDER BY p.id DESC LIMIT 1
    ) AS live_token_encrypted
  FROM keepers k
)
UPDATE partner_api_keys p
SET
  sandbox_key_id = m.sandbox_key_id,
  sandbox_secret_hash = m.sandbox_secret_hash,
  sandbox_key_prefix = m.sandbox_key_prefix,
  sandbox_token_encrypted = m.sandbox_token_encrypted,
  live_key_id = m.live_key_id,
  live_secret_hash = m.live_secret_hash,
  live_key_prefix = m.live_key_prefix,
  live_token_encrypted = m.live_token_encrypted,
  environment = 'both',
  updated_at = NOW()
FROM merged m
WHERE p.id = m.keep_id;

-- Soft-delete older duplicates for the same restaurant
UPDATE partner_api_keys p
SET revoked_at = COALESCE(p.revoked_at, NOW()), updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM partner_api_keys newer
  WHERE newer.restaurant_id = p.restaurant_id
    AND newer.id > p.id
    AND newer.revoked_at IS NULL
)
AND p.revoked_at IS NULL;
