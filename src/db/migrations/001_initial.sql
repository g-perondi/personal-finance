CREATE TABLE schema_migration (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE category (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  created_at TEXT NOT NULL
);

CREATE TABLE transfer (
  id TEXT PRIMARY KEY NOT NULL,
  from_account_id TEXT NOT NULL REFERENCES account (id),
  to_account_id TEXT NOT NULL REFERENCES account (id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  transfer_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE transaction (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES account (id),
  kind TEXT NOT NULL CHECK (
    kind IN ('income', 'expense', 'investment', 'transfer')
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  transfer_leg TEXT CHECK (transfer_leg IN ('out', 'in')),
  transfer_id TEXT REFERENCES transfer (id),
  category_id TEXT REFERENCES category (id),
  expense_kind TEXT CHECK (expense_kind IN ('recurring', 'variable')),
  transaction_date TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_transaction_account_id ON transaction (account_id);

CREATE INDEX idx_transaction_transfer_id ON transaction (transfer_id);

CREATE INDEX idx_transaction_date ON transaction (transaction_date);

CREATE INDEX idx_transfer_from_account ON transfer (from_account_id);

CREATE INDEX idx_transfer_to_account ON transfer (to_account_id);
