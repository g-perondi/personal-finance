import { useEffect, useRef } from 'react'
import { useDbContext } from '../context/db-context'
import { getDatabase } from '../db/database'
import { loadAppSettings } from '../db/repositories/app_setting'
import { isDataDirectoryAvailable } from '../lib/data-directory/storage'
import { syncToDataDirectory } from '../lib/data-directory/sync'

/**
 * Registers data-folder sync before Electron main process quits the app.
 */
export function ElectronWindowClose() {
  const { status: dbStatus } = useDbContext()
  const dbStatusRef = useRef(dbStatus)

  useEffect(() => {
    dbStatusRef.current = dbStatus
  }, [dbStatus])

  useEffect(() => {
    const desktop = window.electronDesktop
    if (!desktop?.registerQuitPrep) {
      return
    }
    return desktop.registerQuitPrep(async () => {
      if (dbStatusRef.current !== 'ready') {
        return
      }
      if (!isDataDirectoryAvailable()) {
        return
      }
      const settings = loadAppSettings(getDatabase())
      if (!settings.dataDirectoryPath) {
        return
      }
      await syncToDataDirectory(settings)
    })
  }, [])

  return null
}
