-- Allow Super Admin to view POS API tokens later (encrypted at rest)
ALTER TABLE partner_api_keys
  ADD COLUMN IF NOT EXISTS token_encrypted TEXT;
