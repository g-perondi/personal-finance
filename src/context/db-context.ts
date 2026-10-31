import { createContext, useContext } from 'react'

export type DbStatus = 'loading' | 'ready' | 'error'

export type DbContextValue = {
  status: DbStatus
  errorMessage: string | null
  retry: () => void
}

export const DbContext = createContext<DbContextValue | null>(null)

export function useDbContext(): DbContextValue {
  const context = useContext(DbContext)
  if (!context) {
    throw new Error('useDbContext must be used within DbProvider')
  }
  return context
}
