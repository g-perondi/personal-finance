import { strToU8 } from 'fflate'
import {
  flushPersist,
  getDatabase,
  inspectSqliteSnapshot,
  reloadDatabaseFromSnapshot,
} from '../../db/database'
import { clearDocumentBlobStore } from '../../db/idb'
import { getCurrentSchemaVersion, runMigrations } from '../../db/migrations'
import type { AppSettings } from '../../db/repositories/app_setting'
import { listDocuments } from '../../db/repositories/document'
import { utcNowIso } from '../datetime'
import { migrateLegacyDocumentBlobsToDirectory } from './document-files'
import {
  BACKUPS_DIR,
  MANIFEST_JSON_PATH,
  SETTINGS_JSON_PATH,
  SQLITE_DB_PATH,
  documentRelativePath,
  type DataDirectoryManifest,
} from './types'
import {
  dataDirectoryPathExists,
  ensureDataDirectorySubdir,
  isDataDirectoryAvailable,
  readDataDirectoryFile,
  writeDataDirectoryFile,
} from './storage'

function encodeJson(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2))
}

export function buildSettingsJson(settings: AppSettings): Record<string, unknown> {
  return {
    dateFormat: settings.dateFormat,
    numberFormat: settings.numberFormat,
    displayTimeZone: settings.displayTimeZone,
    investmentsEnabled: settings.investmentsEnabled,
    documentsEnabled: settings.documentsEnabled,
    dataDirectoryPath: settings.dataDirectoryPath,
    exportedAt: utcNowIso(),
  }
}

async function buildManifest(db = getDatabase()): Promise<DataDirectoryManifest> {
  const docs = listDocuments(db, {})
  const documentFileIndex: Record<string, string> = {}
  for (const doc of docs) {
    documentFileIndex[doc.id] = documentRelativePath(doc.id, doc.fileName)
  }
  return {
    schemaVersion: getCurrentSchemaVersion(db),
    exportedAt: utcNowIso(),
    documentFileIndex,
  }
}

export async function syncToDataDirectory(
  settings: AppSettings,
  options?: { skipLegacyBlobMigration?: boolean },
): Promise<void> {
  if (!isDataDirectoryAvailable()) {
    throw new Error('Data directory is not configured.')
  }
  const db = getDatabase()
  const sqlite = await flushPersist()
  await writeDataDirectoryFile(SQLITE_DB_PATH, sqlite)
  const manifest = await buildManifest(db)
  await writeDataDirectoryFile(MANIFEST_JSON_PATH, encodeJson(manifest))
  await writeDataDirectoryFile(
    SETTINGS_JSON_PATH,
    encodeJson(buildSettingsJson(settings)),
  )
  await ensureDataDirectorySubdir(BACKUPS_DIR)
  if (!options?.skipLegacyBlobMigration) {
    await migrateLegacyDocumentBlobsToDirectory(db)
  }
  await clearDocumentBlobStore()
}

export async function syncFromDataDirectory(): Promise<
  'imported' | 'seeded' | 'empty'
> {
  if (!isDataDirectoryAvailable()) {
    return 'empty'
  }
  const sqliteRaw = await readDataDirectoryFile(SQLITE_DB_PATH)
  if (!sqliteRaw) {
    return 'empty'
  }
  await inspectSqliteSnapshot(new Uint8Array(sqliteRaw))
  await reloadDatabaseFromSnapshot(new Uint8Array(sqliteRaw))
  runMigrations(getDatabase(), () => {
    /* persist scheduled by callers */
  })
  await migrateLegacyDocumentBlobsToDirectory(getDatabase())
  await clearDocumentBlobStore()
  return 'imported'
}

export async function seedDataDirectoryIfEmpty(settings: AppSettings): Promise<void> {
  const hasDb = await dataDirectoryPathExists(SQLITE_DB_PATH)
  if (hasDb) {
    return
  }
  await syncToDataDirectory(settings)
}

export async function writeBackupZipToDataDirectory(
  zipBytes: Uint8Array,
  fileName: string,
): Promise<string> {
  await ensureDataDirectorySubdir(BACKUPS_DIR)
  const relativePath = `${BACKUPS_DIR}/${fileName}`
  await writeDataDirectoryFile(relativePath, zipBytes)
  return relativePath
}
