import { useEffect, useRef, useState } from 'react'
import { useDbContext } from '../context/db-context'
import { getDatabase, schedulePersist } from '../db/database'
import { loadAppSettings } from '../db/repositories/app_setting'
import { isDataDirectoryAvailable } from '../lib/data-directory/storage'
import { syncToDataDirectory } from '../lib/data-directory/sync'
import { Modal } from './ui/Modal'
import { isElectronApp } from '../lib/electron-shell'

export function ElectronWindowClose() {
  const { status: dbStatus } = useDbContext()
  const dbStatusRef = useRef(dbStatus)
  const [exitOpen, setExitOpen] = useState(false)
  const [exitWorking, setExitWorking] = useState(false)
  const [exitError, setExitError] = useState<string | null>(null)

  useEffect(() => {
    dbStatusRef.current = dbStatus
  }, [dbStatus])

  useEffect(() => {
    const desktop = window.electronDesktop
    if (!desktop?.onRequestClose) {
      return
    }
    return desktop.onRequestClose(() => {
      setExitError(null)
      setExitOpen(true)
    })
  }, [])

  async function finishQuit(skipSync: boolean) {
    setExitWorking(true)
    setExitError(null)
    try {
      if (!skipSync && dbStatusRef.current === 'ready' && isDataDirectoryAvailable()) {
        const settings = loadAppSettings(getDatabase())
        if (settings.dataDirectoryPath) {
          await syncToDataDirectory(settings, { skipLegacyBlobMigration: true })
          schedulePersist()
        }
      }
      await window.electronDesktop?.quit?.()
    } catch (error: unknown) {
      setExitError(
        error instanceof Error ? error.message : 'Unable to sync before exit.',
      )
      setExitWorking(false)
    }
  }

  if (!isElectronApp()) {
    return null
  }

  const hasDataFolder = isDataDirectoryAvailable()

  return (
    <Modal
      title="Exit application?"
      open={exitOpen}
      layerClassName="z-[100]"
      onClose={() => !exitWorking && setExitOpen(false)}
    >
      <p className="text-sm text-slate-300">
        {hasDataFolder
          ? 'Save open data to your folder and exit?'
          : 'Close the application?'}
      </p>
      {exitError ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {exitError}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          disabled={exitWorking}
          onClick={() => setExitOpen(false)}
        >
          Cancel
        </button>
        {exitError ? (
          <button
            type="button"
            className="rounded-lg border border-amber-700/80 bg-amber-950/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-900/40 disabled:opacity-50"
            disabled={exitWorking}
            onClick={() => void finishQuit(true)}
          >
            Exit without saving
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-50"
          disabled={exitWorking}
          onClick={() => void finishQuit(false)}
        >
          {exitWorking ? 'Saving…' : 'Exit'}
        </button>
      </div>
    </Modal>
  )
}
