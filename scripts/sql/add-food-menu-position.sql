-- Menu item sort order per restaurant + category (vendor drag-and-drop). Idempotent.
ALTER TABLE food
  ADD COLUMN IF NOT EXISTS position BIGINT NOT NULL DEFAULT 0;

UPDATE food AS f
SET position = sub.rn
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY restaurant_id, COALESCE(category_id, 0)
      ORDER BY id ASC
    ) AS rn
  FROM food
) AS sub
WHERE f.id = sub.id
  AND f.position = 0;
