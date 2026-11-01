import { assertSafePathSegment } from './safe-path'

export type DocumentFileErrorCode = 'missing_file' | 'directory_unavailable'

export type DocumentFileReadResult =
  | { ok: true; data: ArrayBuffer }
  | {
      ok: false
      code: DocumentFileErrorCode
      expectedRelativePath: string
      message: string
    }

export type DocumentFileStatus = {
  documentId: string
  ok: boolean
  expectedRelativePath: string
}

export type DataDirectoryManifest = {
  schemaVersion: number
  exportedAt: string
  documentFileIndex: Record<string, string>
}

export const SETTINGS_JSON_PATH = 'settings.json'
export const SQLITE_DB_PATH = 'sqlite.db'
export const MANIFEST_JSON_PATH = 'manifest.json'
export const BACKUPS_DIR = 'backups'

export function documentRelativePath(documentId: string, fileName: string): string {
  const safeId = assertSafePathSegment(documentId, 'document id')
  const safeName = assertSafePathSegment(fileName, 'document file name')
  return `documents/${safeId}/${safeName}`
}
