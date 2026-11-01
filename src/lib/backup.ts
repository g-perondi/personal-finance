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
import {
  ensureBrowserDirectoryPermission,
  getBrowserDirectoryHandle,
  isDataDirectoryAvailable,
} from './data-directory/storage'
import { BACKUPS_DIR } from './data-directory/types'
import { utcNowIso } from './datetime'

export const BACKUP_FORMAT_VERSION = 1
const MANIFEST_PATH = 'manifest.json'
const SQLITE_PATH = 'sqlite.db'
const BLOB_PREFIX = 'blobs/'
const MAX_BACKUP_BYTES = 100 * 1024 * 1024

function isElectronDesktop(): boolean {
  return Boolean(window.electronDesktop?.isElectron)
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
  const blobIds = docs.map((doc) => doc.id).toSorted()

  const zipEntries: Record<string, Uint8Array> = {}
  zipEntries[SQLITE_PATH] = sqlite

  let missingDocumentCount = 0
  for (const doc of docs) {
    const result = await readDocumentFile(db, doc.id)
    if (!result.ok) {
      missingDocumentCount += 1
      continue
    }
    zipEntries[`${BLOB_PREFIX}${doc.id}`] = new Uint8Array(result.data)
  }

  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: utcNowIso(),
    schemaVersion,
    blobIds: blobIds.filter((id) => zipEntries[`${BLOB_PREFIX}${id}`] !== undefined),
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
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error('Unsupported backup format version.')
  }
  if (typeof manifest.exportedAt !== 'string' || !Array.isArray(manifest.blobIds)) {
    throw new Error('Invalid backup manifest.')
  }
  return manifest
}

function blobIdsFromZip(entries: Record<string, Uint8Array>): string[] {
  const ids: string[] = []
  for (const path of Object.keys(entries)) {
    if (path.startsWith(BLOB_PREFIX) && path.length > BLOB_PREFIX.length) {
      ids.push(path.slice(BLOB_PREFIX.length))
    }
  }
  return ids
}

export async function importBackupZip(file: File): Promise<void> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('Backup file exceeds the maximum allowed size (100 MB).')
  }

  const buffer = await file.arrayBuffer()
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(buffer)) as Record<string, Uint8Array>
  } catch {
    throw new Error('Unable to read backup file (not a valid ZIP archive).')
  }

  const manifestRaw = entries[MANIFEST_PATH]
  const sqliteRaw = entries[SQLITE_PATH]
  if (!manifestRaw || !sqliteRaw) {
    throw new Error('Backup is missing manifest.json or sqlite.db.')
  }

  const manifest = parseManifest(manifestRaw)
  const zipBlobIds = new Set(blobIdsFromZip(entries))

  for (const id of manifest.blobIds) {
    if (!zipBlobIds.has(id)) {
      throw new Error(`Backup is missing blob for document ${id}.`)
    }
  }

  const { documentIds } = await inspectSqliteSnapshot(sqliteRaw)
  for (const docId of documentIds) {
    if (!zipBlobIds.has(docId)) {
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
      const entry = entries[`${BLOB_PREFIX}${id}`]
      if (!entry) {
        return
      }
      const doc = getDocumentById(db, id)
      if (!doc) {
        return
      }
      const chunk = entry.slice()
      if (isDataDirectoryAvailable()) {
        await writeDocumentFile(id, doc.fileName, chunk.buffer)
      }
    }),
  )

  window.location.reload()
}
