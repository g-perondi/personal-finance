# Contributing

## Git

- Default branch: **`main`** — integration branch; **do not commit directly on `main`**
- Every change starts on a **topic branch** and merges into `main` when done
- Commits follow **[Conventional Commits](https://www.conventionalcommits.org/)** in **English**
- **`scope` is always required** (no empty scope). Repo-wide changes use scope **`global`**.

### Branches

Use one of these prefixes, then a **short kebab-case** slug (include scope when it helps: `feat/db-account-schema`).

| Prefix     | Purpose                                                   | Examples                                        |
| ---------- | --------------------------------------------------------- | ----------------------------------------------- |
| `feat/`    | New behavior or domain capability                         | `feat/db-init`, `feat/app-transfer-form`        |
| `fix/`     | Bug fixes                                                 | `fix/ui-nav-active-state`                       |
| `chore/`   | Tooling, deps, repo maintenance                           | `chore/global-prettier`, `chore/deps-bump-vite` |
| `release/` | **Versioned** release line; merge to `main` when shipping | `release/0.1.0`, `release/1.0.0`                |

**Release branches:** name `release/<semver>` (no `v` prefix). Use for stabilizing a version (final fixes, version bump in `package.json`, release notes). When ready, merge into `main` and tag `vX.Y.Z` on `main` if you use tags.

**Workflow:**

```bash
git checkout main
git pull   # when a remote exists
git checkout -b feat/db-account-schema
# … commits …
git checkout main
git merge feat/db-account-schema
git branch -d feat/db-account-schema
```

Keep branches short-lived and aligned with one coherent task (same granularity as a single merge).

### Commits

### Commit format

```text
<type>(<scope>): <subject>

[optional body]
```

- **subject:** imperative, lowercase, no trailing period, ~72 characters
- **body:** optional; explain why, not what changed line-by-line

### Types

| Type       | Use                                      |
| ---------- | ---------------------------------------- |
| `feat`     | User-facing or domain behavior           |
| `fix`      | Bug fix                                  |
| `refactor` | Code change without behavior change      |
| `docs`     | Documentation only                       |
| `style`    | Formatting only (Prettier), no logic     |
| `chore`    | Maintenance                              |
| `build`    | Build tooling (Vite, TypeScript project) |
| `test`     | Tests                                    |
| `perf`     | Performance                              |

### Scopes (current)

`app`, `db`, `ui`, `deps`, `global`, `config`, `git`

Add new scopes only when a recurring area appears; prefer an existing scope when it fits.

### Examples

```text
chore(global): add prettier and oxlint tooling
chore(git): add husky and commitlint
feat(db): add account table migration
fix(ui): correct active nav link on dashboard
docs(global): update readme roadmap
```

## Before you commit

Hooks run on commit (see below). Manually, after a task:

```bash
npm run format
npm run lint
```

## Hooks

- **pre-commit:** `lint-staged` (Prettier on staged files, Oxlint on staged TS/TSX)
- **commit-msg:** Commitlint validates type, required scope, and conventional format

Install hooks after clone: `npm install` (runs `prepare` → Husky).

## Code conventions

- **Code:** English identifiers, comments, and file names
- **UI copy:** Italian
- **Domain entities:** singular names (`account`, `transaction`, `category`, …)
- **Formatting:** Prettier is the source of truth (see `.prettierrc`)
- **Lint:** Oxlint (see `.oxlintrc.json`)

Editor: format on save recommended via `.vscode/settings.json` and the Prettier extension.
