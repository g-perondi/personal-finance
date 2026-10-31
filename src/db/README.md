# Local database layer

SQLite via [sql.js](https://github.com/sql-js/sql.js) in the browser. The binary snapshot is persisted in **IndexedDB** (`personal-finance` / store `database` / key `sqlite`).

## Date and time

All persisted timestamps are **UTC ISO 8601** strings (`…Z`). Application code uses `src/lib/datetime.ts`:

- **Audit fields** (`created_at`, `archived_at`, `schema_migration.applied_at`): `utcNowIso()` on write; format with `formatDateTimeInRome()` in UI when needed.
- **Business calendar dates** (`transaction_date`, `transfer_date`): stored as UTC instants representing **start of that calendar day in `Europe/Rome`**. Forms use `<input type="date">` via `utcIsoToRomeDateInputValue()` / `todayRomeDateInputValue()`; lists use `formatCalendarDateInRome()`.
- Legacy rows with bare `YYYY-MM-DD` are normalized on read to Rome-midnight UTC.

There is no timezone picker; display always uses **Europe/Rome**.

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
- `account` — real-world accounts (e.g. Intesa, Revolut, Trade Republic as one row); `archived_at` set when archived (migration 2)
- `category` — user-defined; `type` is `income` or `expense`; optional `default_recurrence_kind` (migration 3)
- `transfer` — header for money moved between two accounts
- `"transaction"` — ledger lines on an account (quoted name: `transaction` is a SQL reserved word); `recurrence_kind` on income, expense, and investment rows (migration 3 renames from `expense_kind`)

## Recurrence (`recurrence_kind`)

Values: `recurring` | `variable`. Required on **`income`**, **`expense`**, and **`investment`** transactions; **`NULL`** on **transfer** legs.

`category.default_recurrence_kind` optionally prefills the transaction form (expense categories also label investments such as PAC).

Future projections can filter: `kind IN ('income','expense','investment') AND recurrence_kind = 'recurring'`.

Helper: `recurrenceKindForTransactionKind()` in [`recurrence.ts`](recurrence.ts).

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
