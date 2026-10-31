import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Browser export has no ESM default; use wasm build + public/sql-wasm.wasm
      'sql.js': path.resolve(
        projectRoot,
        'node_modules/sql.js/dist/sql-wasm-browser.js',
      ),
    },
  },
  optimizeDeps: {
    include: ['sql.js'],
  },
})
