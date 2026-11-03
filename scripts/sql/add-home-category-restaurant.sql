-- Home screen category ↔ restaurant assignments ("What's on your mind").
CREATE TABLE IF NOT EXISTS home_category_restaurant (
  id BIGSERIAL PRIMARY KEY,
  category_id DECIMAL NOT NULL,
  restaurant_id DECIMAL NOT NULL
);

CREATE INDEX IF NOT EXISTS home_category_restaurant_category_id_idx
  ON home_category_restaurant (category_id);

CREATE INDEX IF NOT EXISTS home_category_restaurant_restaurant_id_idx
  ON home_category_restaurant (restaurant_id);

CREATE UNIQUE INDEX IF NOT EXISTS home_category_restaurant_category_restaurant_unique
  ON home_category_restaurant (category_id, restaurant_id);
