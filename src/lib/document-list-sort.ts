import type { DocumentListItem } from '../db/repositories/model'
import { normalizeStoredCalendarUtc } from './datetime'
import { resolveDocumentMimeType } from './document-upload'

export type DocumentSortColumn = 'title' | 'year' | 'type' | 'size' | 'date'
export type SortDirection = 'asc' | 'desc'

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

/** Same key as SQL list order when sorting by date: day, else 1 Jan of reference year. */
export function documentEffectiveDateMs(doc: DocumentListItem): number {
  if (doc.documentDate) {
    return new Date(normalizeStoredCalendarUtc(doc.documentDate)).getTime()
  }
  return Date.UTC(doc.referenceYear, 0, 1)
}

function compareDocumentListItems(
  a: DocumentListItem,
  b: DocumentListItem,
  column: DocumentSortColumn,
): number {
  let result = 0
  switch (column) {
    case 'title':
      result = compareStrings(a.title, b.title)
      break
    case 'year':
      result = a.referenceYear - b.referenceYear
      break
    case 'type':
      result = compareStrings(
        resolveDocumentMimeType(a.mimeType, a.fileName),
        resolveDocumentMimeType(b.mimeType, b.fileName),
      )
      break
    case 'size':
      result = a.sizeBytes - b.sizeBytes
      break
    case 'date':
      result = documentEffectiveDateMs(a) - documentEffectiveDateMs(b)
      if (result === 0) {
        result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }
      break
  }
  if (result === 0) {
    result = compareStrings(a.id, b.id)
  }
  return result
}

export function sortDocumentListItems(
  items: DocumentListItem[],
  column: DocumentSortColumn,
  direction: SortDirection,
): DocumentListItem[] {
  const sign = direction === 'asc' ? 1 : -1
  return items.toSorted((a, b) => sign * compareDocumentListItems(a, b, column))
}

export function defaultSortDirectionForColumn(
  column: DocumentSortColumn,
): SortDirection {
  return column === 'date' ? 'desc' : 'asc'
}
