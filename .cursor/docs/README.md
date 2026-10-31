# Framework documentation snapshots

Offline copies of official docs aligned with versions in [VERSIONS.md](./VERSIONS.md). Used by humans and agents when implementing features.

## Updating

1. Bump packages in `package.json` and run `npm install`.
2. Update `VERSIONS.md` from `npm list --depth=0`.
3. Re-download LLM-oriented dumps where available:
   - Vite: `https://vite.dev/llms-full.txt` → `vite/llms-full.txt`
   - React: `https://react.dev/llms.txt` → `react/llms.txt`
   - Tailwind: `https://tailwindcss.com/llms-full.txt` → `tailwindcss/llms-full.txt`
   - React Router: `https://reactrouter.com/llms.txt` → `react-router/llms.txt`
4. Refresh package READMEs from `node_modules` for sql.js, recharts, date-fns.
5. Re-copy `node_modules/sql.js/dist/sql-wasm.wasm` to `public/sql-wasm.wasm` if sql.js version changed.

Prefer `curl -L` on Windows if `Invoke-WebRequest` fails on large files.

## Layout

```text
docs/
  VERSIONS.md
  README.md
  vite/
  react/
  typescript/
  tailwindcss/
  sql-js/
  react-router/
  recharts/
  date-fns/
```

Do not commit secrets. These files are safe to version.
