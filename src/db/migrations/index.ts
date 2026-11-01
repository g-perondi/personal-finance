import type { Database } from 'sql.js'
import initialSql from './001_initial.sql?raw'
import accountArchivedSql from './002_account_archived.sql?raw'
import recurrenceKindSql from './003_recurrence_kind.sql?raw'
import accountOpenedAtSql from './004_account_opened_at.sql?raw'
import documentSql from './005_document.sql?raw'
import documentTagSql from './006_document_tag.sql?raw'
import transactionRebalancingSql from './011_transaction_rebalancing.sql?raw'
import accountIsPrimarySql from './012_account_is_primary.sql?raw'
import categoryUniqueNameSql from './013_category_unique_name_per_type.sql?raw'
import instrumentAssetKindSql from './014_instrument_asset_kind.sql?raw'
import appSettingSql from './015_app_setting.sql?raw'
import transferDeletedAccountLabelSql from './016_transfer_deleted_account_label.sql?raw'
import instrumentHoldingSql from './010_instrument_holding.sql?raw'
import dropFtsSql from './009_drop_fts.sql?raw'
import { utcNowIso } from '../../lib/datetime'

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: initialSql },
  { version: 2, sql: accountArchivedSql },
  { version: 3, sql: recurrenceKindSql },
  { version: 4, sql: accountOpenedAtSql },
  { version: 5, sql: documentSql },
  { version: 6, sql: documentTagSql },
  { version: 9, sql: dropFtsSql },
  { version: 10, sql: instrumentHoldingSql },
  { version: 11, sql: transactionRebalancingSql },
  { version: 12, sql: accountIsPrimarySql },
  { version: 13, sql: categoryUniqueNameSql },
  { version: 14, sql: instrumentAssetKindSql },
  { version: 15, sql: appSettingSql },
  { version: 16, sql: transferDeletedAccountLabelSql },
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
