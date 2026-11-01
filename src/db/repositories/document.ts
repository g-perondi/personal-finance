import type { Database } from 'sql.js'
import {
  deleteDocumentFile,
  readDocumentFile,
  writeDocumentFile,
} from '../../lib/data-directory/document-files'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { appendDocumentSearchClauses } from '../../lib/document-search-query'
import {
  DOCUMENT_MAX_BYTES,
  buildStoredDocumentFileName,
  isAllowedDocumentMimeType,
} from '../../lib/document-upload'
import {
  normalizeStoredCalendarUtc,
  parseCalendarDateForStorage,
  toUtcIsoString,
  utcNowIso,
} from '../../lib/datetime'
import {
  ensureDocumentCategoryForName,
  pruneUnusedDocumentCategories,
} from './document_category'
import type { DocumentListItem, DocumentRecord, DocumentTagSummary } from './model'

function mapDocumentRow(row: Record<string, unknown>): DocumentRecord {
  const documentDateRaw = row.document_date
  return {
    id: String(row.id),
    referenceYear: Number(row.reference_year),
    title: String(row.title),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    documentDate:
      documentDateRaw == null
        ? null
        : normalizeStoredCalendarUtc(String(documentDateRaw)),
    note: row.note == null ? null : String(row.note),
    createdAt: toUtcIsoString(String(row.created_at)),
  }
}

const DOCUMENT_SELECT = `
  SELECT
    id,
    reference_year,
    title,
    file_name,
    mime_type,
    size_bytes,
    document_date,
    note,
    created_at
  FROM document
`

/** Newest first: `document_date`, else start of `reference_year`, then `created_at`. */
const DOCUMENT_LIST_ORDER = `
  ORDER BY
    COALESCE(
      document_date,
      printf('%04d-01-01T00:00:00.000Z', reference_year)
    ) DESC,
    created_at DESC
`

function loadTagsForDocuments(
  db: Database,
  documentIds: string[],
): Map<string, DocumentTagSummary[]> {
  const tagsByDocument = new Map<string, DocumentTagSummary[]>()
  for (const documentId of documentIds) {
    tagsByDocument.set(documentId, [])
  }
  if (documentIds.length === 0) {
    return tagsByDocument
  }

  const placeholders = documentIds.map(() => '?').join(', ')
  const stmt = db.prepare(
    `SELECT
      document_tag.document_id,
      document_category.id,
      document_category.name
     FROM document_tag
     INNER JOIN document_category ON document_category.id = document_tag.document_category_id
     WHERE document_tag.document_id IN (${placeholders})
     ORDER BY document_category.name COLLATE NOCASE ASC`,
  )
  stmt.bind(documentIds)
  while (stmt.step()) {
    const row = stmt.getAsObject()
    const documentId = String(row.document_id)
    const tag: DocumentTagSummary = {
      id: String(row.id),
      name: String(row.name),
    }
    tagsByDocument.get(documentId)?.push(tag)
  }
  stmt.free()
  return tagsByDocument
}

function syncDocumentTags(db: Database, documentId: string, tagNames: string[]): void {
  const seen = new Set<string>()
  const tagIds: string[] = []
  for (const raw of tagNames) {
    const trimmed = raw.trim()
    if (!trimmed) {
      continue
    }
    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    tagIds.push(ensureDocumentCategoryForName(db, trimmed).id)
  }
  db.run(`DELETE FROM document_tag WHERE document_id = ?`, [documentId])
  for (const tagId of tagIds) {
    db.run(
      `INSERT INTO document_tag (document_id, document_category_id) VALUES (?, ?)`,
      [documentId, tagId],
    )
  }
  pruneUnusedDocumentCategories(db)
}

export type ListDocumentsOptions = {
  referenceYear?: number
  documentCategoryId?: string | null
  searchQuery?: string | null
}

export function listDocumentYears(db: Database): number[] {
  const stmt = db.prepare(
    `SELECT DISTINCT reference_year AS y FROM document ORDER BY reference_year ASC`,
  )
  const years: number[] = []
  while (stmt.step()) {
    years.push(Number(stmt.getAsObject().y))
  }
  stmt.free()
  return years
}

export function countDocuments(db: Database): number {
  const stmt = db.prepare('SELECT COUNT(*) AS count FROM document')
  stmt.step()
  const count = Number(stmt.getAsObject().count)
  stmt.free()
  return count
}

export function listDocuments(
  db: Database,
  options: ListDocumentsOptions,
): DocumentListItem[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (options.referenceYear !== undefined) {
    clauses.push('reference_year = ?')
    params.push(options.referenceYear)
  }
  if (options.documentCategoryId) {
    clauses.push(
      `id IN (SELECT document_id FROM document_tag WHERE document_category_id = ?)`,
    )
    params.push(options.documentCategoryId)
  }
  appendDocumentSearchClauses(clauses, params, options.searchQuery)
  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const sql = `${DOCUMENT_SELECT} ${whereClause} ${DOCUMENT_LIST_ORDER}`
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const records: DocumentRecord[] = []
  while (stmt.step()) {
    records.push(mapDocumentRow(stmt.getAsObject()))
  }
  stmt.free()

  const tagsByDocument = loadTagsForDocuments(
    db,
    records.map((record) => record.id),
  )
  return records.map((record) => ({
    ...record,
    tags: tagsByDocument.get(record.id) ?? [],
  }))
}

export function getDocumentById(db: Database, id: string): DocumentRecord | null {
  const stmt = db.prepare(`${DOCUMENT_SELECT} WHERE id = ? LIMIT 1`)
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapDocumentRow(stmt.getAsObject())
  stmt.free()
  return row
}

export type CreateDocumentInput = {
  referenceYear: number
  title: string
  fileName: string
  mimeType: string
  sizeBytes: number
  fileData: ArrayBuffer
  documentTagNames?: string[]
  documentDate?: string | null
  note?: string | null
}

export async function createDocument(
  db: Database,
  input: CreateDocumentInput,
): Promise<DocumentRecord> {
  if (!Number.isInteger(input.referenceYear) || input.referenceYear < 1900) {
    throw new Error('Enter a valid reference year.')
  }
  if (!input.title.trim()) {
    throw new Error('Title is required.')
  }
  if (!isAllowedDocumentMimeType(input.mimeType)) {
    throw new Error('Only PDF, JPEG, PNG, and WebP files are allowed.')
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > DOCUMENT_MAX_BYTES) {
    throw new Error('File exceeds the 15 MB limit.')
  }

  const id = newId()
  const createdAt = utcNowIso()
  const storedFileName = buildStoredDocumentFileName(input.fileName, createdAt)
  const documentDate = input.documentDate?.trim()
    ? parseCalendarDateForStorage(input.documentDate.trim())
    : null

  db.run(
    `INSERT INTO document (
      id, reference_year, title, file_name, mime_type,
      size_bytes, document_date, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.referenceYear,
      input.title.trim(),
      storedFileName,
      input.mimeType,
      input.sizeBytes,
      documentDate,
      input.note?.trim() || null,
      createdAt,
    ],
  )

  try {
    syncDocumentTags(db, id, input.documentTagNames ?? [])
    await writeDocumentFile(id, storedFileName, input.fileData)
  } catch (error: unknown) {
    db.run(`DELETE FROM document WHERE id = ?`, [id])
    throw error instanceof Error ? error : new Error('Failed to store file.')
  }

  schedulePersist()
  return getDocumentById(db, id)!
}

export type UpdateDocumentInput = {
  referenceYear: number
  title: string
  documentTagNames?: string[]
  documentDate?: string | null
  note?: string | null
}

export function updateDocument(
  db: Database,
  id: string,
  input: UpdateDocumentInput,
): void {
  if (!getDocumentById(db, id)) {
    throw new Error('Document not found.')
  }
  if (!Number.isInteger(input.referenceYear) || input.referenceYear < 1900) {
    throw new Error('Enter a valid reference year.')
  }
  if (!input.title.trim()) {
    throw new Error('Title is required.')
  }
  const documentDate = input.documentDate?.trim()
    ? parseCalendarDateForStorage(input.documentDate.trim())
    : null

  db.run(
    `UPDATE document SET
      reference_year = ?,
      title = ?,
      document_date = ?,
      note = ?
     WHERE id = ?`,
    [
      input.referenceYear,
      input.title.trim(),
      documentDate,
      input.note?.trim() || null,
      id,
    ],
  )
  syncDocumentTags(db, id, input.documentTagNames ?? [])
  schedulePersist()
}

export async function deleteDocument(db: Database, id: string): Promise<void> {
  const doc = getDocumentById(db, id)
  if (!doc) {
    throw new Error('Document not found.')
  }
  await deleteDocumentFile(id, doc.fileName)
  db.run(`DELETE FROM document WHERE id = ?`, [id])
  pruneUnusedDocumentCategories(db)
  schedulePersist()
}

export async function readDocumentBlob(
  db: Database,
  documentId: string,
): Promise<ArrayBuffer | null> {
  const result = await readDocumentFile(db, documentId)
  return result.ok ? result.data : null
}
