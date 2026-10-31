import { getDatabase } from '../db/database'
import { useDbContext } from '../context/db-context'

export function useDatabase() {
  const { status } = useDbContext()
  if (status !== 'ready') {
    throw new Error('Database is not ready')
  }
  return getDatabase()
}
