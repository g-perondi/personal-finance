import type { Database } from 'sql.js'
import {
  disconnectDataDirectory,
  isDataDirectoryAvailable,
  wipeDataDirectoryContents,
} from '../lib/data-directory/storage'
import {
  clearDocumentBlobStore,
  deleteSnapshot,
  loadSnapshot,
  saveSnapshot,
} from './idb'
import { getCurrentSchemaVersion, runMigrations } from './migrations'

const PERSIST_DEBOUNCE_MS = 400

type InitSqlJs = (config?: {
  locateFile?: (file: string, prefix: string) => string
}) => Promise<{
  Database: new (data?: Uint8Array | null) => Database
}>

type SqlJsStatic = Awaited<ReturnType<InitSqlJs>>

let dbInstance: Database | null = null
let initPromise: Promise<Database> | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

async function loadInitSqlJs(): Promise<InitSqlJs> {
  const module = await import('sql.js')
  const init =
    (module as { default?: InitSqlJs }).default ?? (module as unknown as InitSqlJs)
  if (typeof init !== 'function') {
    throw new Error('Failed to load sql.js initializer')
  }
  return init
}

async function loadSqlJsModule(): Promise<SqlJsStatic> {
  const initSqlJs = await loadInitSqlJs()
  return initSqlJs({
    locateFile: (file) => {
      if (file.endsWith('.wasm')) {
        return `${import.meta.env.BASE_URL}sql-wasm.wasm`
      }
      return `${import.meta.env.BASE_URL}${file}`
    },
  })
}

function openDatabase(SQL: SqlJsStatic, snapshot: Uint8Array | null): Database {
  const db = snapshot ? new SQL.Database(snapshot) : new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  runMigrations(db, schedulePersist)
  return db
}

export function schedulePersist(): void {
  if (!dbInstance) {
    return
  }
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    void flushPersistInternal()
  }, PERSIST_DEBOUNCE_MS)
}

async function flushPersistInternal(): Promise<void> {
  if (!dbInstance) {
    return
  }
  const snapshot = dbInstance.export()
  await saveSnapshot(snapshot)
}

/** Write the in-memory database to IndexedDB immediately (clears pending debounce). */
export async function flushPersist(): Promise<Uint8Array> {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!dbInstance) {
    throw new Error('Database is not initialized')
  }
  const snapshot = dbInstance.export()
  await saveSnapshot(snapshot)
  return snapshot
}

async function initDatabaseInternal(): Promise<Database> {
  const SQL = await loadSqlJsModule()
  const snapshot = await loadSnapshot()
  try {
    return openDatabase(SQL, snapshot)
  } catch (error: unknown) {
    if (snapshot) {
      await deleteSnapshot()
      return openDatabase(SQL, null)
    }
    throw error
  }
}

export async function initDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance
  }
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const db = await initDatabaseInternal()
    dbInstance = db
    return db
  })().catch((error: unknown) => {
    initPromise = null
    throw error
  })

  return initPromise
}

export function getDatabase(): Database {
  if (!dbInstance) {
    throw new Error('Database is not initialized')
  }
  return dbInstance
}

/** Replace the in-memory database from a snapshot (e.g. data folder sync). */
export async function reloadDatabaseFromSnapshot(data: Uint8Array): Promise<void> {
  const SQL = await loadSqlJsModule()
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
  dbInstance = openDatabase(SQL, data.slice())
  await saveSnapshot(data.slice())
}

export async function resetDatabaseForRetry(): Promise<void> {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
  initPromise = null
  await deleteSnapshot()
}

/** Remove SQLite snapshot and all document blobs, then reload the app. */
export async function clearAllLocalData(): Promise<void> {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (isDataDirectoryAvailable()) {
    await wipeDataDirectoryContents()
  }
  await disconnectDataDirectory()
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
  initPromise = null
  await clearDocumentBlobStore()
  await deleteSnapshot()
  window.location.reload()
}

export type SqliteSnapshotInspection = {
  schemaVersion: number
  documentIds: string[]
}

/** Open a snapshot in a throwaway in-memory database (does not replace the app singleton). */
export async function inspectSqliteSnapshot(
  data: Uint8Array,
): Promise<SqliteSnapshotInspection> {
  const SQL = await loadSqlJsModule()
  const db = new SQL.Database(data)
  try {
    db.run('PRAGMA foreign_keys = ON')
    const schemaVersion = getCurrentSchemaVersion(db)
    const documentIds = listDocumentIdsInSnapshot(db)
    return { schemaVersion, documentIds }
  } finally {
    db.close()
  }
}

function listDocumentIdsInSnapshot(db: Database): string[] {
  const tableCheck = db.exec(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'document' LIMIT 1",
  )
  if (tableCheck.length === 0 || tableCheck[0]!.values.length === 0) {
    return []
  }
  const result = db.exec('SELECT id FROM document')
  if (result.length === 0) {
    return []
  }
  return result[0]!.values.map((row) => String(row[0]))
}
