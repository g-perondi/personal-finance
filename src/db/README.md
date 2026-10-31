# Local database layer

SQLite via [sql.js](https://github.com/sql-js/sql.js) in the browser. The binary snapshot is persisted in **IndexedDB** (`personal-finance` / store `database` / key `sqlite`).

## Layout

| Module        | Role                                                     |
| ------------- | -------------------------------------------------------- |
| `idb.ts`      | Load/save `Uint8Array` snapshot                          |
| `database.ts` | WASM init, singleton `initDatabase()`, debounced persist |
| `migrations/` | Versioned DDL (`001_initial.sql`)                        |
| `types.ts`    | Domain literals and balance sign helper                  |

Repositories (Phase 2+) will live under `repositories/` and call `getDatabase()` after `DbProvider` is ready.

## Schema (migration 1)

Entities use **singular** table names. Amounts are **integer cents**. Primary keys are **TEXT UUIDs** (generated in application code later).

- `schema_migration` — applied migration versions
- `account` — real-world accounts (e.g. Intesa, Revolut, Trade Republic as one row)
- `category` — user-defined; `type` is `income` or `expense`
- `transfer` — header for money moved between two accounts
- `"transaction"` — ledger lines on an account (quoted name: `transaction` is a SQL reserved word)

Trade Republic is modeled as a **single account**: payments, remunerated cash, manual Saveback/PAC/ETF flows are **`transaction.kind = investment`** (or income/expense/transfer as appropriate), not a separate account type.

## Balance rules

Account balance (derived, not stored):

```text
opening_balance_cents + SUM(signed_amount_cents per transaction row)
```

| `kind`       | `transfer_leg` | Effect on balance |
| ------------ | -------------- | ----------------- |
| `income`     | —              | +amount           |
| `expense`    | —              | −amount           |
| `investment` | —              | −amount           |
| `transfer`   | `out`          | −amount           |
| `transfer`   | `in`           | +amount           |

Helper: `signedAmountCents()` in `types.ts`.

## Transfers

1. Insert one `transfer` row (`from_account_id`, `to_account_id`, `amount_cents`, date).
2. Insert **two** `transaction` rows with the same `transfer_id`:
   - `kind = transfer`, `transfer_leg = out`, `account_id = from_account_id`
   - `kind = transfer`, `transfer_leg = in`, `account_id = to_account_id`

## Investments (manual Saveback / PAC / ETF)

Single `transaction` on the same account (e.g. Trade Republic):

- `kind = investment`
- `amount_cents` > 0 (stored positive; balance uses −amount)
- No `transfer_id`

## Foreign keys

`PRAGMA foreign_keys = ON` is set on every open.

## Migrations

`runMigrations()` reads `MAX(version)` from `schema_migration` and applies SQL files with higher version numbers, then records the version and triggers a debounced IndexedDB persist (~400 ms).
