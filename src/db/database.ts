import type { Database } from 'sql.js'
import { deleteSnapshot, loadSnapshot, saveSnapshot } from './idb'
import { runMigrations } from './migrations'

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
    if (!dbInstance) {
      return
    }
    const snapshot = dbInstance.export()
    void saveSnapshot(snapshot)
  }, PERSIST_DEBOUNCE_MS)
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
