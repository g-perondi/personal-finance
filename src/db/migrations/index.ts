import type { Database } from 'sql.js'
import initialSql from './001_initial.sql?raw'
import accountArchivedSql from './002_account_archived.sql?raw'
import { utcNowIso } from '../../lib/datetime'

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: initialSql },
  { version: 2, sql: accountArchivedSql },
]

function tableExists(db: Database, tableName: string): boolean {
  const stmt = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  )
  stmt.bind([tableName])
  const exists = stmt.step()
  stmt.free()
  return exists
}

export function getCurrentSchemaVersion(db: Database): number {
  if (!tableExists(db, 'schema_migration')) {
    return 0
  }
  const result = db.exec('SELECT MAX(version) AS version FROM schema_migration')
  if (result.length === 0 || result[0]!.values.length === 0) {
    return 0
  }
  const value = result[0]!.values[0]![0]
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  return 0
}

export function runMigrations(db: Database, onMutate: () => void): void {
  const current = getCurrentSchemaVersion(db)
  const pending = MIGRATIONS.filter((m) => m.version > current).toSorted(
    (a, b) => a.version - b.version,
  )

  if (pending.length === 0) {
    return
  }

  for (const migration of pending) {
    db.exec(migration.sql)
    db.run('INSERT INTO schema_migration (version, applied_at) VALUES (?, ?)', [
      migration.version,
      utcNowIso(),
    ])
  }

  onMutate()
}
