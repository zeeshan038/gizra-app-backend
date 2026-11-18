-- Multi-slot combo meals (e.g. 4-burger combo): catalog definition + per-slot cart selections
ALTER TABLE food ADD COLUMN IF NOT EXISTS combo_definition TEXT;
ALTER TABLE carts ADD COLUMN IF NOT EXISTS combo_selections TEXT;
