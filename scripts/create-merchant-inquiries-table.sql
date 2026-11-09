-- Landing page join requests (run once on Postgres)
CREATE TABLE IF NOT EXISTS merchant_inquiries (
  id BIGSERIAL PRIMARY KEY,
  business_name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(200) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(255),
  business_type VARCHAR(100) NOT NULL,
  seen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_inquiries_seen_created_at_idx
  ON merchant_inquiries (seen, created_at DESC);
