ALTER TABLE category ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;

UPDATE category
SET is_system = 1
WHERE type = 'expense' AND name = 'Investments' COLLATE NOCASE;

INSERT INTO category (
  id,
  name,
  type,
  default_recurrence_kind,
  created_at,
  is_system
)
SELECT
  'a0000000-0000-4000-8000-000000000099',
  'Investments',
  'expense',
  'variable',
  '1970-01-01T00:00:00.000Z',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM category
  WHERE type = 'expense' AND name = 'Investments' COLLATE NOCASE
);

UPDATE "transaction"
SET category_id = (
  SELECT id FROM category
  WHERE is_system = 1 AND type = 'expense' AND name = 'Investments' COLLATE NOCASE
  LIMIT 1
)
WHERE kind = 'investment' AND category_id IS NULL;
