# Contributing

## Git

- Default branch: **`main`**
- Commits follow **[Conventional Commits](https://www.conventionalcommits.org/)** in **English**
- **`scope` is always required** (no empty scope). Repo-wide changes use scope **`global`**.

### Format

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
