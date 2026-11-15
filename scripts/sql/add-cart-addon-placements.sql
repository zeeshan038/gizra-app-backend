-- Pizza half/whole: parallel to add_on_ids on consumer cart rows
ALTER TABLE carts ADD COLUMN IF NOT EXISTS add_on_placements TEXT;