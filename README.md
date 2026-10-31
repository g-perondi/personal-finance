# Personal Finance

Browser-only personal finance SPA: multi-account tracking, transfers, categorized expenses (recurring vs variable), a single global dashboard, and administrative documents. No backend, no authentication — all data stays on your machine (SQLite via sql.js + IndexedDB).

## Stack

- React 19 + Vite 8 + TypeScript
- Tailwind CSS 4 + Lucide icons
- sql.js (WASM at `public/sql-wasm.wasm`) + IndexedDB persistence (Phase 1+)
- Recharts, react-router-dom, date-fns, fflate (backup)

## Conventions

- **Code and git messages:** English
- **User-facing UI:** English
- **Domain entity names:** always singular (`account`, `transaction`, `category`, …)

See [CONTRIBUTING.md](CONTRIBUTING.md) for git workflow (branch per change, merge to `main`), commit format, and code style.

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

## Code style

- Prettier + `prettier-plugin-tailwindcss`, Oxlint (React/TS), EditorConfig
- Recommended extensions in `.vscode/extensions.json`, format on save in `.vscode/settings.json`

## Project layout

```text
src/
  components/   # Shared UI (AppShell, …)
  pages/        # Route pages (English UI)
  db/           # sql.js, migrations, repositories (Phase 1+)
  context/      # DbProvider (Phase 1+)
  lib/          # money, dates, savings helpers
public/
  sql-wasm.wasm # sql.js runtime
```

## Roadmap

| Phase | Scope                                                                |
| ----- | -------------------------------------------------------------------- |
| 0     | Project scaffold and tooling (current)                               |
| 1     | Database layer + multi-account schema                                |
| 2     | Accounts, transactions, transfers                                    |
| 3     | Recurrence on income, expense, investment + category defaults        |
| 4     | Global dashboard (scope year/month/day), wealth charts, savings rate |
| 5+    | Documents (MVP), backup zip; recurring rules and budget later        |

## Data notice

Data is stored only in this browser profile (IndexedDB). Use Settings backup (Phase 5+) before clearing site data or switching browsers.
