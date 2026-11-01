ALTER TABLE instrument ADD COLUMN asset_kind TEXT NOT NULL DEFAULT 'etf'
  CHECK (asset_kind IN ('etf', 'equity', 'crypto'));

CREATE INDEX idx_instrument_asset_kind ON instrument (asset_kind);
