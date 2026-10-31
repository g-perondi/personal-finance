# Local database layer

SQLite via [sql.js](https://github.com/sql-js/sql.js) in the browser. The binary snapshot is persisted in **IndexedDB** (`personal-finance` / store `database` / key `sqlite`).

## Date and time

All persisted timestamps are **UTC ISO 8601** strings (`…Z`). Application code uses `src/lib/datetime.ts`:

- **Audit fields** (`created_at`, `archived_at`, `schema_migration.applied_at`): `utcNowIso()` on write; format with `formatDateTimeInRome()` in UI when needed.
- **Business calendar dates** (`transaction_date`, `transfer_date`, `account.opened_at`, optional `document.document_date`): stored as UTC instants representing **start of that calendar day in `Europe/Rome`**. Forms use Rome calendar `YYYY-MM-DD`; documents also allow typing **`dd/MM/yyyy`** and a calendar popover (`RomeCalendarDateInput`); transactions/accounts use `<input type="date">` via `utcIsoToRomeDateInputValue()` / `todayRomeDateInputValue()`; lists use `formatCalendarDateInRome()` or `formatItalianCalendarDateInRome()` for documents.
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
- `account` — real-world accounts (e.g. Intesa, Revolut, Trade Republic as one row); `opened_at` = start of opening day in Rome (migration 4); `archived_at` when archived (migration 2)
- `document_category` / `document` / `document_tag` — administrative files (migrations 5–6); see **Documents** below
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

**Average balance (accounts page):** for the current Rome calendar year, mean of end-of-day balances from 1 Jan through today; days before `account.created_at` are excluded (`getAccountAverageDailyBalanceCentsForRomeCalendarYear()` in `repositories/account.ts`).

**Invested (accounts page):** sum of `investment` transaction amounts on that account in the same Rome calendar year window (`getAccountInvestedCentsForRomeCalendarYear()`).

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

## Dashboard aggregates

Scope uses calendar **Europe/Rome** (`src/lib/dashboard-period.ts`, `src/lib/datetime.ts`). **Global** = from first account year through today; **year** / **month** / **day** zoom into a single period. Global charts cashflow **by calendar year**; wealth uses the **last 12 months** (month-end; current month through today).

**Cashflow** (transfers excluded from income/expense/investment totals):

- **Saved** = income − expense; **savings rate** = saved / income when income > 0
- Investments are a separate series; conceptually part of savings
- **Total balance** (KPI) = wealth at the **end** of the selected scope (`getTotalWealthCentsAt` at `periodBounds` `endUtcExclusive`), not live account balances
- Accounts with `opened_at >= asOf` contribute **0** at that instant (periods before the account opening date)

**Wealth** at instant `T` (non-archived accounts that already exist at `T`, i.e. `opened_at < T`):

- **Total** — opening balance plus signed movements with `transaction_date < T` (same as account balance sum)
- **Investment** — cumulative sum of `investment` transaction amounts before `T`
- **Cash** — total minus investment (remainder of net worth not counted as deployed capital)

Month-end / daily series use the same rules at each point in time.

**Ledger lists** on the dashboard show **Last movements** (all kinds in the selected period, most recent first). Repository sign filters: inflows = income + transfer-in; outflows = expense + investment + transfer-out.

Repository: [`repositories/dashboard.ts`](repositories/dashboard.ts).

## Documents

Metadata in SQLite (`document`, `document_category`, **`document_tag`** junction); file bytes in IndexedDB store **`document_blob`** (key = `document.id`). See [`document-blob.ts`](../document-blob.ts) and [`repositories/document.ts`](repositories/document.ts).

- **`document_tag`**: many-to-many between `document` and `document_category` (migration 6); replaces `document.document_category_id`.
- **`reference_year`** (required): calendar year for filtering in the UI; distinct years come from `listDocumentYears()`.
- **`document_date`**: optional calendar day (Rome → UTC ISO; UI `dd/MM/yyyy`).
- **List order** (`listDocuments`): SQL default newest-first by date / reference year / `created_at`; the documents table lets you re-sort by **Title**, **Year**, **Type**, **Size**, or **Date** (click column header to toggle asc/desc).
- **`document_category`**: tag labels; a row exists only while at least one document links it via **`document_tag`**. Assign names on each document (add/edit modal); new names are persisted on save. Removing a tag from every document (or deleting those documents) drops the unused category row (`pruneUnusedDocumentCategories`).
- Allowed MIME types: PDF, JPEG, PNG, WebP; max **15 MB** per file (`src/lib/document-upload.ts`).
- Create order: insert `document` row → put blob → persist SQLite snapshot. Delete: remove blob then row.
- **`file_name`**: stored as `{base}_{yyyyMMdd_HHmmss}{ext}` (UTC), derived from the uploaded name at create time (`buildStoredDocumentFileName` in `document-upload.ts`).
- UI preview: blob object URLs in [`DocumentViewerModal`](../../components/documents/DocumentViewerModal.tsx) (PDF in `<iframe>`, images in `<img>`); revoked on close.

## Foreign keys

`PRAGMA foreign_keys = ON` is set on every open.

## Backup

Full export is a **ZIP** (`formatVersion` 1) built in [`src/lib/backup.ts`](../lib/backup.ts):

| Entry                | Content                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `manifest.json`      | `formatVersion`, `exportedAt` (UTC ISO), `schemaVersion`, `blobIds` |
| `sqlite.db`          | sql.js snapshot (same bytes as IndexedDB key `sqlite`)              |
| `blobs/{documentId}` | Raw file bytes from IndexedDB store `document_blob`                 |

**Export:** flushes the in-memory DB to IndexedDB (`flushPersist()`), then zips snapshot + all blob keys. Max **100 MB** per archive.

**Restore:** replaces the SQLite snapshot and **clears** then repopulates `document_blob`; validates manifest, opens `sqlite.db` in a throwaway database to ensure every `document.id` has a matching blob entry, then **`window.location.reload()`** so the app singleton reopens cleanly.

UI: sidebar footer **Download backup** / **Restore backup** (English). Restore is destructive — confirm in a modal before import.

## Migrations

`runMigrations()` reads `MAX(version)` from `schema_migration` and applies SQL files with higher version numbers, then records the version and triggers a debounced IndexedDB persist (~400 ms).
