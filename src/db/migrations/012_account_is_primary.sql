ALTER TABLE account ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX account_single_primary ON account (is_primary) WHERE is_primary = 1;
