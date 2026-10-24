-- Run once on prod if table missing (deploy also uses prisma db push).
CREATE TABLE IF NOT EXISTS delivery_man_ignored_orders (
  id BIGSERIAL PRIMARY KEY,
  delivery_man_id DECIMAL NOT NULL,
  order_id DECIMAL NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_man_ignored_orders_dm_order_unique
  ON delivery_man_ignored_orders (delivery_man_id, order_id);

CREATE INDEX IF NOT EXISTS delivery_man_ignored_orders_delivery_man_id_idx
  ON delivery_man_ignored_orders (delivery_man_id);
