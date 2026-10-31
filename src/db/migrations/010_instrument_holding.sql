CREATE TABLE instrument (
  id TEXT PRIMARY KEY NOT NULL,
  isin TEXT UNIQUE,
  quote_symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_instrument_quote_symbol ON instrument (quote_symbol);

CREATE TABLE holding (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES account (id),
  instrument_id TEXT NOT NULL REFERENCES instrument (id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  total_cost_cents INTEGER NOT NULL CHECK (total_cost_cents > 0),
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, instrument_id)
);

CREATE INDEX idx_holding_account_id ON holding (account_id);

CREATE INDEX idx_holding_instrument_id ON holding (instrument_id);

CREATE TABLE holding_purchase (
  id TEXT PRIMARY KEY NOT NULL,
  holding_id TEXT NOT NULL REFERENCES holding (id) ON DELETE CASCADE,
  transaction_id TEXT REFERENCES "transaction" (id) ON DELETE SET NULL,
  purchase_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  price_cents_per_unit REAL NOT NULL CHECK (price_cents_per_unit > 0),
  quantity REAL NOT NULL CHECK (quantity > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_holding_purchase_holding_id ON holding_purchase (holding_id);

CREATE TABLE instrument_quote_cache (
  instrument_id TEXT PRIMARY KEY NOT NULL REFERENCES instrument (id) ON DELETE CASCADE,
  price_cents_per_unit REAL NOT NULL CHECK (price_cents_per_unit > 0),
  fetched_at TEXT NOT NULL
);
