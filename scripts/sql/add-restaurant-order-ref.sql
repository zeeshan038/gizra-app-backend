-- Run once on PostgreSQL (prod/staging) before deploying backend with restaurant_order_ref field.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS restaurant_order_ref VARCHAR(100);
