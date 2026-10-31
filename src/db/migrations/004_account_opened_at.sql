ALTER TABLE account ADD COLUMN opened_at TEXT;

UPDATE account
SET opened_at = created_at
WHERE opened_at IS NULL;
