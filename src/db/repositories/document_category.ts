import type { Database } from 'sql.js'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { toUtcIsoString, utcNowIso } from '../../lib/datetime'
import type { DocumentCategoryRecord } from './model'

export type { DocumentCategoryRecord } from './model'

function mapDocumentCategoryRow(row: Record<string, unknown>): DocumentCategoryRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: toUtcIsoString(String(row.created_at)),
  }
}

const SELECT = `
  SELECT id, name, created_at FROM document_category
`

/** Tags that appear on at least one document (filter pills + autocomplete). */
export function listDocumentCategories(db: Database): DocumentCategoryRecord[] {
  const stmt = db.prepare(
    `${SELECT}
     WHERE id IN (SELECT DISTINCT document_category_id FROM document_tag)
     ORDER BY name COLLATE NOCASE ASC`,
  )
  const rows: DocumentCategoryRecord[] = []
  while (stmt.step()) {
    rows.push(mapDocumentCategoryRow(stmt.getAsObject()))
  }
  stmt.free()
  return rows
}

export function getDocumentCategoryById(
  db: Database,
  id: string,
): DocumentCategoryRecord | null {
  const stmt = db.prepare(`${SELECT} WHERE id = ? LIMIT 1`)
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapDocumentCategoryRow(stmt.getAsObject())
  stmt.free()
  return row
}

export function findDocumentCategoryByName(
  db: Database,
  name: string,
): DocumentCategoryRecord | null {
  const trimmed = name.trim()
  if (!trimmed) {
    return null
  }
  const stmt = db.prepare(`${SELECT} WHERE lower(trim(name)) = lower(?) LIMIT 1`)
  stmt.bind([trimmed])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapDocumentCategoryRow(stmt.getAsObject())
  stmt.free()
  return row
}

function insertDocumentCategory(db: Database, name: string): DocumentCategoryRecord {
  const id = newId()
  const createdAt = utcNowIso()
  db.run(`INSERT INTO document_category (id, name, created_at) VALUES (?, ?, ?)`, [
    id,
    name.trim(),
    createdAt,
  ])
  return getDocumentCategoryById(db, id)!
}

/** Used when saving document tags; not a standalone UI action. */
export function ensureDocumentCategoryForName(
  db: Database,
  name: string,
): DocumentCategoryRecord {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Enter a tag name.')
  }
  return findDocumentCategoryByName(db, trimmed) ?? insertDocumentCategory(db, trimmed)
}

/** Drop tag rows with no remaining document links (after save or document delete). */
export function pruneUnusedDocumentCategories(db: Database): void {
  db.run(
    `DELETE FROM document_category
     WHERE id NOT IN (SELECT DISTINCT document_category_id FROM document_tag)`,
  )
  schedulePersist()
}
