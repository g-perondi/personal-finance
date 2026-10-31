import type { Database } from 'sql.js'
import type { CategoryType } from '../types'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { toUtcIsoString, utcNowIso } from '../../lib/datetime'
import type { CategoryRecord } from './model'
import { TRANSACTION_TABLE } from './sql'

function mapCategoryRow(row: Record<string, unknown>): CategoryRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as CategoryType,
    createdAt: toUtcIsoString(String(row.created_at)),
  }
}

export function listCategories(db: Database, type?: CategoryType): CategoryRecord[] {
  const sql = type
    ? `SELECT id, name, type, created_at FROM category WHERE type = ? ORDER BY name COLLATE NOCASE ASC`
    : `SELECT id, name, type, created_at FROM category ORDER BY type ASC, name COLLATE NOCASE ASC`
  const stmt = db.prepare(sql)
  if (type) {
    stmt.bind([type])
  }
  const rows: CategoryRecord[] = []
  while (stmt.step()) {
    rows.push(mapCategoryRow(stmt.getAsObject()))
  }
  stmt.free()
  return rows
}

export function createCategory(
  db: Database,
  input: { name: string; type: CategoryType },
): CategoryRecord {
  const id = newId()
  const createdAt = utcNowIso()
  db.run(`INSERT INTO category (id, name, type, created_at) VALUES (?, ?, ?, ?)`, [
    id,
    input.name.trim(),
    input.type,
    createdAt,
  ])
  schedulePersist()
  return { id, name: input.name.trim(), type: input.type, createdAt }
}

export function updateCategory(db: Database, id: string, name: string): void {
  db.run(`UPDATE category SET name = ? WHERE id = ?`, [name.trim(), id])
  schedulePersist()
}

export function countCategoryUsage(db: Database, categoryId: string): number {
  const stmt = db.prepare(
    `SELECT COUNT(*) AS count FROM ${TRANSACTION_TABLE} WHERE category_id = ?`,
  )
  stmt.bind([categoryId])
  stmt.step()
  const count = Number(stmt.getAsObject().count)
  stmt.free()
  return count
}

export function deleteCategory(db: Database, id: string): void {
  const usage = countCategoryUsage(db, id)
  if (usage > 0) {
    throw new Error('Category is used by transactions and cannot be deleted.')
  }
  db.run(`DELETE FROM category WHERE id = ?`, [id])
  schedulePersist()
}
