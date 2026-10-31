ALTER TABLE account ADD COLUMN archived_at TEXT;

CREATE INDEX idx_account_archived_at ON account (archived_at);
