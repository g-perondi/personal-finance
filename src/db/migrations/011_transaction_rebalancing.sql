CREATE TABLE transaction_rebalancing_new (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES account (id),
  kind TEXT NOT NULL CHECK (
    kind IN ('income', 'expense', 'investment', 'transfer', 'rebalancing')
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  transfer_leg TEXT CHECK (transfer_leg IN ('out', 'in')),
  transfer_id TEXT REFERENCES transfer (id),
  category_id TEXT REFERENCES category (id),
  recurrence_kind TEXT CHECK (recurrence_kind IN ('recurring', 'variable')),
  rebalancing_direction TEXT CHECK (
    rebalancing_direction IS NULL OR rebalancing_direction IN ('increase', 'decrease')
  ),
  transaction_date TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (
      kind = 'rebalancing'
      AND rebalancing_direction IS NOT NULL
      AND category_id IS NULL
      AND recurrence_kind IS NULL
      AND transfer_leg IS NULL
      AND transfer_id IS NULL
    )
    OR (
      kind != 'rebalancing'
      AND rebalancing_direction IS NULL
    )
  )
);

INSERT INTO transaction_rebalancing_new (
  id,
  account_id,
  kind,
  amount_cents,
  transfer_leg,
  transfer_id,
  category_id,
  recurrence_kind,
  rebalancing_direction,
  transaction_date,
  description,
  created_at
)
SELECT
  id,
  account_id,
  kind,
  amount_cents,
  transfer_leg,
  transfer_id,
  category_id,
  recurrence_kind,
  NULL,
  transaction_date,
  description,
  created_at
FROM "transaction";

DROP TABLE "transaction";

ALTER TABLE transaction_rebalancing_new RENAME TO "transaction";

CREATE INDEX idx_transaction_account_id ON "transaction" (account_id);

CREATE INDEX idx_transaction_transfer_id ON "transaction" (transfer_id);

CREATE INDEX idx_transaction_date ON "transaction" (transaction_date);
