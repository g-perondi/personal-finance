import type { Database } from 'sql.js'
import type { CategoryType, RecurrenceKind } from '../types'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { toUtcIsoString, utcNowIso } from '../../lib/datetime'
import type { CategoryRecord } from './model'
import { TRANSACTION_TABLE } from './sql'

function mapRecurrenceKind(value: unknown): RecurrenceKind | null {
  if (value === 'recurring' || value === 'variable') {
    return value
  }
  return null
}

function mapCategoryRow(row: Record<string, unknown>): CategoryRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as CategoryType,
    defaultRecurrenceKind: mapRecurrenceKind(row.default_recurrence_kind),
    createdAt: toUtcIsoString(String(row.created_at)),
  }
}

const CATEGORY_SELECT = `
  SELECT id, name, type, default_recurrence_kind, created_at FROM category
`

export function listCategories(db: Database, type?: CategoryType): CategoryRecord[] {
  const sql = type
    ? `${CATEGORY_SELECT} WHERE type = ? ORDER BY name COLLATE NOCASE ASC`
    : `${CATEGORY_SELECT} ORDER BY type ASC, name COLLATE NOCASE ASC`
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

export function getCategoryById(db: Database, id: string): CategoryRecord | null {
  const stmt = db.prepare(`${CATEGORY_SELECT} WHERE id = ? LIMIT 1`)
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapCategoryRow(stmt.getAsObject())
  stmt.free()
  return row
}

export type CreateCategoryInput = {
  name: string
  type: CategoryType
  defaultRecurrenceKind?: RecurrenceKind | null
}

export function createCategory(
  db: Database,
  input: CreateCategoryInput,
): CategoryRecord {
  const id = newId()
  const createdAt = utcNowIso()
  const defaultRecurrenceKind = input.defaultRecurrenceKind ?? null
  db.run(
    `INSERT INTO category (id, name, type, default_recurrence_kind, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.name.trim(), input.type, defaultRecurrenceKind, createdAt],
  )
  schedulePersist()
  return getCategoryById(db, id)!
}

export type UpdateCategoryInput = {
  name: string
  defaultRecurrenceKind?: RecurrenceKind | null
}

export function updateCategory(
  db: Database,
  id: string,
  input: UpdateCategoryInput,
): void {
  const existing = getCategoryById(db, id)
  if (!existing) {
    throw new Error('Category not found.')
  }
  const defaultRecurrenceKind =
    input.defaultRecurrenceKind === undefined
      ? existing.defaultRecurrenceKind
      : input.defaultRecurrenceKind
  db.run(`UPDATE category SET name = ?, default_recurrence_kind = ? WHERE id = ?`, [
    input.name.trim(),
    defaultRecurrenceKind,
    id,
  ])
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
