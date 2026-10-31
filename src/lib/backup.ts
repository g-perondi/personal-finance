import { strToU8, unzipSync, zipSync } from 'fflate'
import { putDocumentBlob, getDocumentBlob } from '../db/document-blob'
import { flushPersist, getDatabase, inspectSqliteSnapshot } from '../db/database'
import {
  clearDocumentBlobStore,
  listDocumentBlobKeys,
  replaceSnapshot,
} from '../db/idb'
import { getCurrentSchemaVersion } from '../db/migrations'
import { utcNowIso } from './datetime'

export const BACKUP_FORMAT_VERSION = 1
const MANIFEST_PATH = 'manifest.json'
const SQLITE_PATH = 'sqlite.db'
const BLOB_PREFIX = 'blobs/'
const MAX_BACKUP_BYTES = 100 * 1024 * 1024

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

function backupDownloadFileName(): string {
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

export async function exportBackupZip(): Promise<void> {
  const sqlite = await flushPersist()
  const schemaVersion = getCurrentSchemaVersion(getDatabase())
  const blobIds = await listDocumentBlobKeys()
  blobIds.sort()

  const zipEntries: Record<string, Uint8Array> = {}
  zipEntries[SQLITE_PATH] = sqlite

  const blobPayloads = await Promise.all(
    blobIds.map(async (id) => {
      const blob = await getDocumentBlob(id)
      if (!blob) {
        return null
      }
      return { id, data: new Uint8Array(blob) }
    }),
  )
  for (const payload of blobPayloads) {
    if (!payload) {
      continue
    }
    zipEntries[`${BLOB_PREFIX}${payload.id}`] = payload.data
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

  const blob = new Blob([zipped], { type: 'application/zip' })
  triggerBlobDownload(blob, backupDownloadFileName())
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
  await clearDocumentBlobStore()

  const idsToRestore = [...new Set([...manifest.blobIds, ...documentIds])]
  await Promise.all(
    idsToRestore.map(async (id) => {
      const entry = entries[`${BLOB_PREFIX}${id}`]
      if (!entry) {
        return
      }
      const chunk = entry.slice()
      await putDocumentBlob(id, chunk.buffer)
    }),
  )

  window.location.reload()
}
