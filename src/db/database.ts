import initSqlJs, { type Database } from 'sql.js'
import { loadSnapshot, saveSnapshot } from './idb'
import { runMigrations } from './migrations'

const PERSIST_DEBOUNCE_MS = 400

let dbInstance: Database | null = null
let initPromise: Promise<Database> | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

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

export async function initDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance
  }
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: (file) => `${import.meta.env.BASE_URL}${file}`,
    })
    const snapshot = await loadSnapshot()
    const db = snapshot ? new SQL.Database(snapshot) : new SQL.Database()
    db.run('PRAGMA foreign_keys = ON')
    runMigrations(db, schedulePersist)
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
}
