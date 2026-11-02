import { strToU8, unzipSync, zipSync } from 'fflate'
import {
  flushPersist,
  getDatabase,
  inspectSqliteSnapshot,
  reloadDatabaseFromSnapshot,
} from '../db/database'
import { clearDocumentBlobStore, replaceSnapshot } from '../db/idb'
import { getCurrentSchemaVersion, runMigrations } from '../db/migrations'
import { getDocumentById, listDocuments } from '../db/repositories/document'
import { readDocumentFile, writeDocumentFile } from './data-directory/document-files'
import { isSafePathSegment } from './data-directory/safe-path'
import {
  ensureBrowserDirectoryPermission,
  getBrowserDirectoryHandle,
  isDataDirectoryAvailable,
} from './data-directory/storage'
import { BACKUPS_DIR, documentRelativePath } from './data-directory/types'
import { utcNowIso } from './datetime'
import { DOCUMENT_MAX_BYTES } from './document-upload'
import { hasElectronDesktopBridge } from './electron-shell'

export const BACKUP_FORMAT_VERSION = 2
const SUPPORTED_BACKUP_FORMAT_VERSIONS = new Set([1, BACKUP_FORMAT_VERSION])
const MANIFEST_PATH = 'manifest.json'
const SQLITE_PATH = 'sqlite.db'
const DOCUMENTS_PREFIX = 'documents/'
/** Older exports stored each file as `blobs/{documentId}` with no extension. */
const LEGACY_BLOB_PREFIX = 'blobs/'
const MAX_BACKUP_BYTES = 100 * 1024 * 1024
const MAX_BACKUP_UNCOMPRESSED_BYTES = MAX_BACKUP_BYTES
const MAX_BACKUP_ZIP_ENTRIES = 10_000
const BACKUP_DOCUMENT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DOCUMENT_BACKUP_FILE_RE = /\.(pdf|jpe?g|png|webp)$/i

function isElectronDesktop(): boolean {
  return hasElectronDesktopBridge()
}

function padUtc(n: number): string {
  return String(n).padStart(2, '0')
}

type BackupManifest = {
  formatVersion: number
  exportedAt: string
  schemaVersion: number
  blobIds: string[]
}

function encodeJson(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2))
}

function decodeJson<T>(data: Uint8Array): T {
  const text = new TextDecoder().decode(data)
  return JSON.parse(text) as T
}

export function backupDownloadFileName(): string {
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${padUtc(now.getUTCMonth() + 1)}${padUtc(now.getUTCDate())}-${padUtc(now.getUTCHours())}${padUtc(now.getUTCMinutes())}`
  return `personal-finance-backup-${stamp}.zip`
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function isSavePickerUserAbort(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }
  if (error instanceof Error && /aborted a request/i.test(error.message)) {
    return true
  }
  return false
}

const BACKUP_ZIP_PICKER_TYPES = [
  {
    description: 'Backup ZIP',
    accept: { 'application/zip': ['.zip'] },
  },
] satisfies {
  description: string
  accept: Record<string, string[]>
}[]

/** Must run early in a click handler (before long async work) when possible. */
async function pickBrowserBackupSaveFile(
  fileName: string,
): Promise<FileSystemFileHandle | null> {
  if (typeof window.showSaveFilePicker !== 'function') {
    return null
  }
  const options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
    startIn?: FileSystemDirectoryHandle
  } = {
    suggestedName: fileName,
    types: BACKUP_ZIP_PICKER_TYPES,
  }
  const rootHandle = getBrowserDirectoryHandle()
  if (rootHandle && (await ensureBrowserDirectoryPermission('readwrite'))) {
    try {
      options.startIn = await rootHandle.getDirectoryHandle(BACKUPS_DIR, {
        create: true,
      })
    } catch {
      options.startIn = rootHandle
    }
  }
  try {
    return await window.showSaveFilePicker(options)
  } catch (error: unknown) {
    if (isSavePickerUserAbort(error)) {
      return null
    }
    throw error
  }
}

async function writeBrowserBackupFile(
  handle: FileSystemFileHandle,
  bytes: Uint8Array,
): Promise<void> {
  const writable = await handle.createWritable()
  const chunk = bytes.slice()
  await writable.write(chunk)
  await writable.close()
}

export type BackupBuildResult = {
  bytes: Uint8Array
  missingDocumentCount: number
}

export async function buildBackupZipBytes(): Promise<BackupBuildResult> {
  const db = getDatabase()
  const sqlite = await flushPersist()
  const schemaVersion = getCurrentSchemaVersion(db)
  const docs = listDocuments(db, {})

  const zipEntries: Record<string, Uint8Array> = {}
  zipEntries[SQLITE_PATH] = sqlite

  let missingDocumentCount = 0
  const includedIds: string[] = []
  for (const doc of docs) {
    const result = await readDocumentFile(db, doc.id)
    if (!result.ok) {
      missingDocumentCount += 1
      continue
    }
    const entryPath = backupDocumentZipPath(doc.id, doc.fileName)
    zipEntries[entryPath] = new Uint8Array(result.data)
    includedIds.push(doc.id)
  }

  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: utcNowIso(),
    schemaVersion,
    blobIds: includedIds.toSorted(),
  }
  zipEntries[MANIFEST_PATH] = encodeJson(manifest)

  const zipped = zipSync(zipEntries, { level: 6 })
  if (zipped.byteLength > MAX_BACKUP_BYTES) {
    throw new Error('Backup exceeds the maximum allowed size (100 MB).')
  }

  return { bytes: zipped, missingDocumentCount }
}

export type ExportBackupZipResult = {
  missingDocumentCount: number
  cancelled?: boolean
}

export async function exportBackupZip(): Promise<ExportBackupZipResult> {
  const fileName = backupDownloadFileName()
  let browserSaveHandle: FileSystemFileHandle | null = null
  if (!isElectronDesktop() && typeof window.showSaveFilePicker === 'function') {
    browserSaveHandle = await pickBrowserBackupSaveFile(fileName)
    if (!browserSaveHandle) {
      return { missingDocumentCount: 0, cancelled: true }
    }
  }

  const { bytes, missingDocumentCount } = await buildBackupZipBytes()

  if (isElectronDesktop()) {
    const saved = await window.electronDesktop?.saveBackupZipAs?.(fileName, bytes)
    if (!saved) {
      return { missingDocumentCount: 0, cancelled: true }
    }
    return { missingDocumentCount }
  }

  if (browserSaveHandle) {
    await writeBrowserBackupFile(browserSaveHandle, bytes)
    return { missingDocumentCount }
  }

  triggerBlobDownload(new Blob([bytes.slice()], { type: 'application/zip' }), fileName)
  return { missingDocumentCount }
}

function parseManifest(raw: Uint8Array): BackupManifest {
  const manifest = decodeJson<BackupManifest>(raw)
  if (!SUPPORTED_BACKUP_FORMAT_VERSIONS.has(manifest.formatVersion)) {
    throw new Error('Unsupported backup format version.')
  }
  if (typeof manifest.exportedAt !== 'string' || !Array.isArray(manifest.blobIds)) {
    throw new Error('Invalid backup manifest.')
  }
  return manifest
}

function isBackupDocumentFileName(fileName: string): boolean {
  return isSafePathSegment(fileName) && DOCUMENT_BACKUP_FILE_RE.test(fileName)
}

function backupDocumentZipPath(documentId: string, fileName: string): string {
  if (!BACKUP_DOCUMENT_ID_RE.test(documentId)) {
    throw new Error('Backup contains an invalid document id.')
  }
  if (!isBackupDocumentFileName(fileName)) {
    throw new Error(`Backup contains an invalid file name for document ${documentId}.`)
  }
  return documentRelativePath(documentId, fileName)
}

type ZipEntryMeta = {
  name: string
  size: number
  originalSize: number
  compression: number
}

type BackupZipEntry =
  | { kind: 'manifest' | 'sqlite' }
  | { kind: 'document'; id: string; fileName: string | null }

function classifyBackupZipEntry(name: string): BackupZipEntry {
  if (
    !name ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.includes('..') ||
    name.startsWith('/') ||
    name.endsWith('/')
  ) {
    throw new Error('Backup contains an invalid archive entry path.')
  }
  if (name === MANIFEST_PATH) {
    return { kind: 'manifest' }
  }
  if (name === SQLITE_PATH) {
    return { kind: 'sqlite' }
  }

  if (name.startsWith(LEGACY_BLOB_PREFIX)) {
    const id = name.slice(LEGACY_BLOB_PREFIX.length)
    if (id.includes('/')) {
      throw new Error('Backup contains an invalid archive entry path.')
    }
    if (!BACKUP_DOCUMENT_ID_RE.test(id)) {
      throw new Error('Backup contains an invalid document id.')
    }
    return { kind: 'document', id, fileName: null }
  }

  if (name.startsWith(DOCUMENTS_PREFIX)) {
    const rest = name.slice(DOCUMENTS_PREFIX.length)
    const slash = rest.indexOf('/')
    if (slash <= 0 || rest.includes('/', slash + 1)) {
      throw new Error('Backup contains an invalid archive entry path.')
    }
    const id = rest.slice(0, slash)
    const fileName = rest.slice(slash + 1)
    if (!BACKUP_DOCUMENT_ID_RE.test(id)) {
      throw new Error('Backup contains an invalid document id.')
    }
    if (!isBackupDocumentFileName(fileName)) {
      throw new Error(`Backup contains an invalid file name for document ${id}.`)
    }
    return { kind: 'document', id, fileName }
  }

  throw new Error('Backup contains unexpected files.')
}

function indexBackupDocuments(
  entries: Record<string, Uint8Array>,
): Map<string, { bytes: Uint8Array; fileName: string | null }> {
  const indexed = new Map<string, { bytes: Uint8Array; fileName: string | null }>()
  for (const [path, bytes] of Object.entries(entries)) {
    if (path === MANIFEST_PATH || path === SQLITE_PATH) {
      continue
    }
    const entry = classifyBackupZipEntry(path)
    if (entry.kind !== 'document') {
      continue
    }
    const existing = indexed.get(entry.id)
    if (!existing) {
      indexed.set(entry.id, { bytes, fileName: entry.fileName })
      continue
    }
    if (existing.fileName === null && entry.fileName !== null) {
      indexed.set(entry.id, { bytes, fileName: entry.fileName })
      continue
    }
    if (existing.fileName !== null && entry.fileName === null) {
      continue
    }
    throw new Error(`Backup contains more than one file for document ${entry.id}.`)
  }
  return indexed
}

function unzipBackupEntries(compressed: Uint8Array): Record<string, Uint8Array> {
  let entryCount = 0
  let totalUncompressed = 0

  try {
    return unzipSync(compressed, {
      filter(file: ZipEntryMeta) {
        entryCount += 1
        if (entryCount > MAX_BACKUP_ZIP_ENTRIES) {
          throw new Error('Backup contains too many archive entries.')
        }

        const entry = classifyBackupZipEntry(file.name)

        if (file.originalSize < 0 || file.size < 0) {
          throw new Error('Backup contains invalid archive entry sizes.')
        }

        if (entry.kind === 'manifest' || entry.kind === 'sqlite') {
          if (file.originalSize > MAX_BACKUP_BYTES) {
            throw new Error('Backup entry exceeds the maximum allowed size (100 MB).')
          }
        } else if (file.originalSize > DOCUMENT_MAX_BYTES) {
          throw new Error('Backup document file exceeds the maximum allowed size.')
        }

        totalUncompressed += file.originalSize
        if (totalUncompressed > MAX_BACKUP_UNCOMPRESSED_BYTES) {
          throw new Error(
            'Backup uncompressed size exceeds the maximum allowed (100 MB).',
          )
        }

        return true
      },
    }) as Record<string, Uint8Array>
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Unable to read backup file (not a valid ZIP archive).', {
      cause: error,
    })
  }
}

export async function importBackupZip(file: File): Promise<void> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('Backup file exceeds the maximum allowed size (100 MB).')
  }

  const buffer = await file.arrayBuffer()
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipBackupEntries(new Uint8Array(buffer))
  } catch (error: unknown) {
    throw error instanceof Error
      ? error
      : new Error('Unable to read backup file (not a valid ZIP archive).')
  }

  const manifestRaw = entries[MANIFEST_PATH]
  const sqliteRaw = entries[SQLITE_PATH]
  if (!manifestRaw || !sqliteRaw) {
    throw new Error('Backup is missing manifest.json or sqlite.db.')
  }

  const manifest = parseManifest(manifestRaw)
  const documents = indexBackupDocuments(entries)

  for (const id of manifest.blobIds) {
    if (!documents.has(id)) {
      throw new Error(`Backup is missing file for document ${id}.`)
    }
  }

  const { documentIds } = await inspectSqliteSnapshot(sqliteRaw)
  for (const docId of documentIds) {
    if (!documents.has(docId)) {
      throw new Error(`Backup is missing file data for document ${docId}.`)
    }
  }

  await replaceSnapshot(sqliteRaw)
  await reloadDatabaseFromSnapshot(sqliteRaw.slice())
  runMigrations(getDatabase(), () => {
    /* persisted on next flush */
  })
  await clearDocumentBlobStore()

  const db = getDatabase()
  const idsToRestore = [...new Set([...manifest.blobIds, ...documentIds])]
  await Promise.all(
    idsToRestore.map(async (id) => {
      const stored = documents.get(id)
      if (!stored) {
        return
      }
      const doc = getDocumentById(db, id)
      if (!doc) {
        return
      }
      if (stored.fileName !== null && stored.fileName !== doc.fileName) {
        throw new Error(`Backup contains an invalid file name for document ${id}.`)
      }
      if (stored.bytes.byteLength > DOCUMENT_MAX_BYTES) {
        throw new Error('Backup document file exceeds the maximum allowed size.')
      }
      const chunk = stored.bytes.slice()
      if (isDataDirectoryAvailable()) {
        try {
          await writeDocumentFile(id, doc.fileName, chunk.buffer)
        } catch {
          throw new Error(`Backup contains an invalid file name for document ${id}.`)
        }
      }
    }),
  )

  window.location.reload()
}
