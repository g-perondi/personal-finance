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
- `category` — user-defined; `type` is `income` or `expense`; optional `default_recurrence_kind` (migration 3); **unique name per `type`** (case-insensitive, migration 13)
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

| `kind`        | `transfer_leg` | Effect on balance |
| ------------- | -------------- | ----------------- |
| `income`      | —              | +amount           |
| `expense`     | —              | −amount           |
| `investment`  | —              | −amount           |
| `transfer`    | `out`          | −amount           |
| `transfer`    | `in`           | +amount           |
| `rebalancing` | `increase`     | +amount           |
| `rebalancing` | `decrease`     | −amount           |

Period KPI **Income** / **Expenses** include rebalancing increase / decrease respectively (not investment).

Helper: `signedAmountCents()` in `types.ts`.

**Average balance (accounts page):** for the current Rome calendar year, mean of end-of-day balances from 1 Jan through today; days before `account.created_at` are excluded (`getAccountAverageDailyBalanceCentsForRomeCalendarYear()` in `repositories/account.ts`).

**Investments (accounts page):** market value of holdings per account from `instrument_quote_cache` (same logic as the Investments page; shows `—` when there are holdings but no cached quotes yet).

## Transfers

1. Insert one `transfer` row (`from_account_id`, `to_account_id`, `amount_cents`, date).
2. Insert **two** `transaction` rows with the same `transfer_id`:
   - `kind = transfer`, `transfer_leg = out`, `account_id = from_account_id`
   - `kind = transfer`, `transfer_leg = in`, `account_id = to_account_id`

When an account is **deleted**, the leg on that account is removed; the other leg stays. Migration **16** stores the removed name on `transfer.from_account_deleted_label` / `to_account_deleted_label` (FK repointed to a hidden placeholder account). Transaction lists show the counterparty as **`Name (deleted)`**.

## Investments (manual Saveback / PAC / ETF)

Single `transaction` on the same account (e.g. Trade Republic):

- `kind = investment`
- `amount_cents` > 0 (stored positive; balance uses −amount)
- No `transfer_id`

## Dashboard aggregates

Scope uses calendar **Europe/Rome** (`src/lib/dashboard-period.ts`, `src/lib/datetime.ts`). **Global** = from first account year through today; **year** / **month** / **day** zoom into a single period. Global charts cashflow **by calendar year**; wealth uses the **last 12 months** (month-end; current month through today).

**Cashflow** (transfers excluded from income/expense/investment totals):

- **Net balance** = income − expense; **savings rate** = net balance / income when income > 0
- Investments are a separate series; conceptually part of savings
- **Total balance** (KPI) = wealth at the **end** of the selected scope (`getTotalWealthCentsAt` at `periodBounds` `endUtcExclusive`), not live account balances
- Accounts with `opened_at >= asOf` contribute **0** at that instant (periods before the account opening date)

**Wealth** at instant `T` (non-archived accounts that already exist at `T`, i.e. `opened_at < T`):

- **Total** — sum of account balances at `T` plus **holdings cost basis** from `holding_purchase` rows with `purchase_date < T` (opening seeds and buys; ETF, stocks, crypto)
- **Investment** — that holdings cost basis plus **`investment`** transactions before `T` that are not linked to a holding purchase (avoids double-counting recorded buys)
- **Cash** — total minus investment (liquid / non-deployed portion in this model)

Month-end / daily series use the same rules at each point in time. Historical points use **cost basis**, not market quotes.

**Ledger lists** on the dashboard show **Last movements** (all kinds in the selected period, most recent first). Repository sign filters: inflows = income + transfer-in; outflows = expense + investment + transfer-out.

Repository: [`repositories/dashboard.ts`](repositories/dashboard.ts).

## Portfolio holdings (migrations 10 + 14)

Portfolio positions are separate from the cash ledger: **`instrument`** (`asset_kind`: `etf` | `equity` | `crypto`, optional ISIN, `quote_symbol`, name), **`holding`** (one row per account + instrument: `quantity`, `total_cost_cents`), **`holding_purchase`** (audit line; optional `transaction_id` for buys that also post an **`investment`** transaction).

| `asset_kind` | Lookup                     | `quote_symbol`                | Live price (EUR) |
| ------------ | -------------------------- | ----------------------------- | ---------------- |
| `etf`        | Yahoo search (ISIN/ticker) | Yahoo symbol (e.g. `SWDA.MI`) | Yahoo chart + FX |
| `equity`     | Yahoo search (ISIN/ticker) | Yahoo symbol                  | Yahoo chart + FX |
| `crypto`     | Yahoo search (name/ticker) | Yahoo pair (e.g. `BTC-EUR`)   | Yahoo chart + FX |

Migration **14** adds `instrument.asset_kind` with default **`etf`** for existing rows (backup restore from pre-14 builds upgrades via `runMigrations()`).

- **Weighted average cost:** display avg = `total_cost_cents / quantity`; new buys add amount to cost and units from `amount_cents / price_cents_per_unit`.
- **Opening seed:** `createOpeningHolding` — `openingDate`, `quantity`, and average **`priceCentsPerUnit`** (cost basis = round(qty × price)); optional **`recordInvestmentTransaction`** (default on in UI) posts a matching **`investment`** row and links `holding_purchase.transaction_id`. Uncheck **Deduct from account balance** for assets you already hold (portfolio only).
- **New purchase:** `recordHoldingPurchase` — updates holding, inserts purchase, inserts matching **`transaction`** (`kind = investment`) on the same account/date/amount.
- **Delete investment transaction:** `deleteSimpleTransaction` on a linked row runs `reverseHoldingPurchaseForTransaction` first (removes the purchase line and reduces or deletes the holding). Unlinked manual **`investment`** rows only remove the ledger line.
- **Recent purchases (Investments UI):** `updateHoldingPurchase` / `deleteHoldingPurchase` keep `holding`, `holding_purchase`, and linked **`investment`** transactions in sync (delete removes the ledger row when `transaction_id` is set).
- **Quotes:** [`src/lib/market-quotes/`](../lib/market-quotes/) fetches delayed/unofficial prices in the browser (Yahoo Finance via CORS proxy + SQLite **`instrument_quote_cache`**). All asset kinds use the same Yahoo chart path with conversion to EUR when needed.
- **Wealth chart** uses the rules above (holdings cost basis over time; not live quote marks).

Repositories: [`repositories/instrument.ts`](repositories/instrument.ts), [`repositories/holding.ts`](repositories/holding.ts).

## App settings (migration 15)

Table **`app_setting`** (`key`, `value`, `updated_at`) stores UI preferences: date/number formats, IANA time zone, feature toggles (investments/documents), and data folder display path. Loaded via [`repositories/app_setting.ts`](repositories/app_setting.ts) and [`AppSettingsProvider`](../../context/AppSettingsProvider.tsx). Legacy `display_currency` keys from older builds are ignored.

## Data folder sync

When configured (Settings or Documents gate), the app treats a user-chosen folder as the home for **`sqlite.db`**, **`documents/{id}/{file_name}`**, **`manifest.json`**, **`settings.json`**, and **`backups/*.zip`**. Runtime CRUD still uses sql.js + IndexedDB; the folder is synced **on startup** (import DB snapshot) and **on exit / Sync now** (export). Browser: File System Access handle in IndexedDB (`fs_directory_handle`, IDB v3). Desktop: Electron IPC file ops in [`electron/main.mjs`](../../../electron/main.mjs).

Implementation: [`src/lib/data-directory/`](../lib/data-directory/).

## Documents

Metadata in SQLite (`document`, `document_category`, **`document_tag`** junction); **file bytes on disk** under `{dataDirectory}/documents/{documentId}/{file_name}` — not in IndexedDB. See [`document-files.ts`](../lib/data-directory/document-files.ts) and [`repositories/document.ts`](repositories/document.ts).

Legacy **`document_blob`** IndexedDB entries are migrated into the data folder on sync when present.

- **`document_tag`**: many-to-many between `document` and `document_category` (migration 6); replaces `document.document_category_id`.
- **`reference_year`** (required): calendar year for filtering in the UI; distinct years come from `listDocumentYears()`.
- **`document_date`**: optional calendar day (Rome → UTC ISO; UI `dd/MM/yyyy`).
- **List order** (`listDocuments`): SQL default newest-first by date / reference year / `created_at`; the documents table lets you re-sort by **Title**, **Year**, **Type**, **Size**, or **Date** (click column header to toggle asc/desc).
- **Full-text search:** case-insensitive **LIKE** on `title`, `note`, `file_name`, and tag names (`appendDocumentSearchClauses` in [`document-search-query.ts`](../lib/document-search-query.ts)). No FTS5 — the bundled sql.js WASM does not include that module.
- **`document_category`**: tag labels; a row exists only while at least one document links it via **`document_tag`**. Assign names on each document (add/edit modal); new names are persisted on save. Removing a tag from every document (or deleting those documents) drops the unused category row (`pruneUnusedDocumentCategories`).
- Allowed MIME types: PDF, JPEG, PNG, WebP; max **15 MB** per file (`src/lib/document-upload.ts`).
- Create order: insert `document` row → write file under data folder → persist SQLite snapshot. Delete: remove file then row.
- **`file_name`**: stored as `{base}_{yyyyMMdd_HHmmss}{ext}` (UTC), derived from the uploaded name at create time (`buildStoredDocumentFileName` in `document-upload.ts`).
- UI preview: blob object URLs in [`DocumentViewerModal`](../../components/documents/DocumentViewerModal.tsx) (PDF in `<iframe>`, images in `<img>`); revoked on close.

## Transactions (list search)

Case-insensitive **LIKE** on **description**, **account name**, and **category name** within the selected period (`appendTransactionSearchClauses` in [`document-search-query.ts`](../lib/document-search-query.ts)).

## Foreign keys

`PRAGMA foreign_keys = ON` is set on every open.

## Backup

Full export is a **ZIP** (`formatVersion` 2) built in [`src/lib/backup.ts`](../lib/backup.ts):

| Entry                               | Content                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                     | `formatVersion`, `exportedAt` (UTC ISO), `schemaVersion`, `blobIds` (document ids whose files are in the ZIP) |
| `sqlite.db`                         | sql.js snapshot (same bytes as IndexedDB key `sqlite`)                                                        |
| `documents/{documentId}/{fileName}` | PDF or image bytes, same relative path as the data folder (`fileName` keeps `.pdf`, `.jpg`, `.png`, `.webp`)  |
| `blobs/{documentId}`                | Legacy layout from `formatVersion` 1. Restore still reads these entries.                                      |

**Export:** flushes the in-memory DB, reads document files from the data folder when configured, then zips. The app opens a **Save** dialog (browser: File System Access save picker; desktop: native save dialog). The default folder is **`backups/`** under your configured data directory when one is set. Max **100 MB** per archive.

**Restore:** replaces the SQLite snapshot, writes each document file into **`documents/{id}/{fileName}`** when a data folder is available, validates manifest, then **`window.location.reload()`**. Accepts `formatVersion` 1 (`blobs/{id}`) and 2 (`documents/{id}/{fileName}`).

UI: sidebar footer **Download backup** / **Restore backup** / **Clear all data** (English). Restore and clear are destructive — confirm in a modal before proceeding.

### Backward compatibility (required)

**Every new version of the app must remain able to import data exported by older versions.**

This applies to:

1. **Backup ZIP** (`manifest.formatVersion` in [`backup.ts`](../lib/backup.ts)) — if you introduce a new format version, **restore must still accept every previous `formatVersion`** (implement explicit branches or adapters; do not drop support without a documented migration tool).
2. **SQLite inside the ZIP** — after restore, `runMigrations()` upgrades older `schema_version` snapshots forward. **Migrations must be additive and safe** for data created under prior schema versions (no silent data loss).
3. **Document files** — IDs referenced in SQLite must keep matching a file in the ZIP. Current exports use `documents/{id}/{fileName}`. Restore must keep accepting the legacy `blobs/{id}` layout.

Treat a user’s backup file as a long-lived contract: browser, Electron, and future channels all share the same export format.

## Migrations

`runMigrations()` reads `MAX(version)` from `schema_migration` and applies SQL files with higher version numbers, then records the version and triggers a debounced IndexedDB persist (~400 ms).

When authoring a new migration, assume users may **restore a backup** from an older build: migrated data must remain readable and semantically consistent with pre-migration exports (see **Backward compatibility** under Backup).
