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
    isSystem: Number(row.is_system) === 1,
  }
}

const CATEGORY_SELECT = `
  SELECT id, name, type, default_recurrence_kind, created_at, is_system FROM category
`

export const INVESTMENTS_SYSTEM_CATEGORY_ID = 'a0000000-0000-4000-8000-000000000099'

const DUPLICATE_CATEGORY_NAME_MESSAGE =
  'A category with this name already exists for this type.'

function findCategoryByNameForType(
  db: Database,
  type: CategoryType,
  name: string,
  excludeId?: string,
): CategoryRecord | null {
  const trimmed = name.trim()
  const stmt = db.prepare(
    excludeId
      ? `${CATEGORY_SELECT} WHERE type = ? AND name = ? COLLATE NOCASE AND id != ? LIMIT 1`
      : `${CATEGORY_SELECT} WHERE type = ? AND name = ? COLLATE NOCASE LIMIT 1`,
  )
  if (excludeId) {
    stmt.bind([type, trimmed, excludeId])
  } else {
    stmt.bind([type, trimmed])
  }
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapCategoryRow(stmt.getAsObject())
  stmt.free()
  return row
}

function assertUniqueCategoryName(
  db: Database,
  type: CategoryType,
  name: string,
  excludeId?: string,
): void {
  if (findCategoryByNameForType(db, type, name, excludeId)) {
    throw new Error(DUPLICATE_CATEGORY_NAME_MESSAGE)
  }
}

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

/** Categories the user can manage on the Categories page (excludes system rows). */
export function listUserCategories(
  db: Database,
  type?: CategoryType,
): CategoryRecord[] {
  return listCategories(db, type).filter((row) => !row.isSystem)
}

export function getInvestmentsCategoryId(db: Database): string {
  const stmt = db.prepare(
    `${CATEGORY_SELECT}
     WHERE is_system = 1 AND type = 'expense' AND name = 'Investments' COLLATE NOCASE
     LIMIT 1`,
  )
  if (!stmt.step()) {
    stmt.free()
    return INVESTMENTS_SYSTEM_CATEGORY_ID
  }
  const row = mapCategoryRow(stmt.getAsObject())
  stmt.free()
  return row.id
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
  const trimmedName = input.name.trim()
  assertUniqueCategoryName(db, input.type, trimmedName)
  const id = newId()
  const createdAt = utcNowIso()
  const defaultRecurrenceKind = input.defaultRecurrenceKind ?? null
  db.run(
    `INSERT INTO category (id, name, type, default_recurrence_kind, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, trimmedName, input.type, defaultRecurrenceKind, createdAt],
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
  if (existing.isSystem) {
    throw new Error('System categories cannot be edited.')
  }
  const trimmedName = input.name.trim()
  assertUniqueCategoryName(db, existing.type, trimmedName, id)
  const defaultRecurrenceKind =
    input.defaultRecurrenceKind === undefined
      ? existing.defaultRecurrenceKind
      : input.defaultRecurrenceKind
  db.run(`UPDATE category SET name = ?, default_recurrence_kind = ? WHERE id = ?`, [
    trimmedName,
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
  const existing = getCategoryById(db, id)
  if (!existing) {
    throw new Error('Category not found.')
  }
  if (existing.isSystem) {
    throw new Error('System categories cannot be deleted.')
  }
  const usage = countCategoryUsage(db, id)
  if (usage > 0) {
    throw new Error('Category is used by transactions and cannot be deleted.')
  }
  db.run(`DELETE FROM category WHERE id = ?`, [id])
  schedulePersist()
}
