import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { initDatabase, resetDatabaseForRetry } from '../db/database'
import { DbContext, type DbContextValue, type DbStatus } from './db-context'

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('indexeddb') || message.includes('idb')) {
      return 'Impossibile accedere alla memoria locale del browser (IndexedDB).'
    }
    if (message.includes('wasm') || message.includes('sql-wasm')) {
      return 'Impossibile caricare il motore del database (WebAssembly).'
    }
    return 'Errore durante l’inizializzazione del database locale.'
  }
  return 'Errore sconosciuto durante l’inizializzazione del database.'
}

type DbProviderProps = {
  children: ReactNode
}

export function DbProvider({ children }: DbProviderProps) {
  const [status, setStatus] = useState<DbStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const runInit = useCallback(async () => {
    try {
      await initDatabase()
      setStatus('ready')
    } catch (error: unknown) {
      setErrorMessage(resolveErrorMessage(error))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void initDatabase()
      .then(() => {
        if (!cancelled) {
          setStatus('ready')
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(resolveErrorMessage(error))
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    void resetDatabaseForRetry().then(() => runInit())
  }, [runInit])

  const value = useMemo<DbContextValue>(
    () => ({
      status,
      errorMessage,
      retry,
    }),
    [status, errorMessage, retry],
  )

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>
}
