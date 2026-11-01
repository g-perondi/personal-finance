# Personal Finance

Browser-only personal finance SPA: multi-account tracking, transfers, categorized expenses (recurring vs variable), a single global dashboard, and administrative documents. No backend, no authentication — all data stays on your machine (SQLite via sql.js + IndexedDB).

## Stack

- React 19 + Vite 8 + TypeScript
- Tailwind CSS 4 + Lucide icons (`@fontsource/inconsolata`)
- sql.js (WASM at `public/sql-wasm.wasm`) + IndexedDB persistence
- Recharts, react-router-dom, date-fns, fflate (backup ZIP)

## Conventions

- **Code and git messages:** English
- **User-facing UI:** English
- **Domain entity names:** always singular (`account`, `transaction`, `category`, …)

See [CONTRIBUTING.md](CONTRIBUTING.md) for git workflow (branch per change, merge to `main`), commit format, and code style. Database behavior and schema notes: [`src/db/README.md`](src/db/README.md).

## Scripts

```bash
npm install
npm run dev
npm run build
npm run preview
npm run format        # Prettier write (run after each task)
npm run format:check  # CI-style format check
npm run lint          # Oxlint
npm run lint:fix      # Oxlint auto-fix where supported
```

### Desktop (Electron)

Packaged app for daily use (no Node server while using the app). Data stays local in the app’s Chromium profile (IndexedDB), separate from Chrome/Edge. The desktop build serves the UI at a **fixed** `http://127.0.0.1:39217` origin so IndexedDB survives restarts (do not change that port in `electron/main.mjs` without a migration plan).

**Prerequisites:** Node.js for building only.

```bash
npm run electron:dev          # Vite + Electron window (http://localhost:5173)
npm run build:electron        # Frontend build with relative asset paths (./)
npm run electron:pack           # Clear artifacts/, icons, build:electron (no installer)
npm run electron:build:win      # Windows portable .exe under artifacts/ (run on Windows)
npm run electron:build:mac      # macOS .dmg + .zip under artifacts/ (run on macOS)
npm run electron:build          # Alias for electron:build:win
```

**Platform notes:** `electron-builder` produces Windows installers only on Windows and macOS bundles only on macOS. There is no cross-compilation between them.

**Moving data from the browser:** IndexedDB is per origin. Export **Download backup** in the browser, then **Restore backup** in the desktop app.

**After code changes:** run the build for your OS (`electron:build:win` or `electron:build:mac`) and replace the app in `artifacts/`.

## Code style

- Prettier + `prettier-plugin-tailwindcss`, Oxlint (React/TS), EditorConfig
- Recommended extensions in `.vscode/extensions.json`, format on save in `.vscode/settings.json`

## Project layout

```text
src/
  components/   # Shared UI (AppShell, dashboard widgets, documents, …)
  pages/        # Routes: dashboard, transactions, investments, accounts, categories, documents
  db/           # sql.js init, migrations, repositories, IndexedDB helpers
  context/      # DbProvider
  lib/          # money, dates, savings, backup ZIP, list search helpers
public/
  sql-wasm.wasm # sql.js runtime
electron/
  main.mjs      # Electron main process (dev URL + prod static server)
  preload.mjs   # contextBridge (desktop flag only)
```

## Roadmap

| Phase | Scope                                                                       | Status  |
| ----- | --------------------------------------------------------------------------- | ------- |
| 0     | Project scaffold and tooling                                                | Done    |
| 1     | Database layer + multi-account schema                                       | Done    |
| 2     | Accounts, transactions, transfers                                           | Done    |
| 3     | Recurrence on income, expense, investment + category defaults               | Done    |
| 4     | Global dashboard (year / month / day), wealth charts, savings rate          | Done    |
| 5     | Documents (MVP), sidebar backup ZIP, list search, clear local data          | Done    |
| 6     | ETF portfolio (holdings, WAC, live quotes without API key), `/investments`  | Done    |
| 7     | Balance reconcile (`rebalancing`), transaction modal balance preview        | Done    |
| 7+    | Recurring rules (scheduled generation), budget, sales / richer broker tools | Planned |

**Phase 7 (shipped):** **Reconcile balance** on Accounts creates a `rebalancing` ledger row; transaction add/edit modal shows **Current balance** and **Balance after entry** (including transfers).

**Phase 6 (shipped):** `/investments` — ETF holdings with weighted average cost, opening positions and purchases (amount + NAV → units), linked `investment` ledger rows on buy, delayed third-party quotes fetched when you open Investments or click **Refresh quotes** (dashboard shows last cached prices only; no API key).

**Phase 5 (shipped):** document upload with tags and year filters; export/import backup (SQLite + document blobs); LIKE search on documents and transactions; **Clear all data** with typed confirmation in the sidebar.

**Not planned (for now):** backend, auth, multi-currency, per-account dashboard pages.

## Data notice

Data lives only in this browser profile (IndexedDB: SQLite snapshot + document blobs). Use **Download backup** in the sidebar before clearing site data or switching browsers. **Restore backup** and **Clear all data** replace or wipe local data after confirmation — download a backup first if you need a copy.

**Compatibility:** newer app versions must still **restore backup ZIP files** created by older versions (see [`src/db/README.md`](src/db/README.md)).
