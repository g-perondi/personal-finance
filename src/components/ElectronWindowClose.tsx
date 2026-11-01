import { useEffect, useState } from 'react'
import { useDbContext } from '../context/db-context'
import { getDatabase } from '../db/database'
import { loadAppSettings } from '../db/repositories/app_setting'
import { isDataDirectoryAvailable } from '../lib/data-directory/storage'
import { syncToDataDirectory } from '../lib/data-directory/sync'
import { Modal } from './ui/Modal'

/**
 * Handles the Electron window close button (always mounted once the DB is ready).
 */
export function ElectronWindowClose() {
  const { status: dbStatus } = useDbContext()
  const [exitOpen, setExitOpen] = useState(false)
  const [exitWorking, setExitWorking] = useState(false)
  const [exitError, setExitError] = useState<string | null>(null)

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
      if (!skipSync && dbStatus === 'ready' && isDataDirectoryAvailable()) {
        const settings = loadAppSettings(getDatabase())
        if (settings.dataDirectoryPath) {
          await syncToDataDirectory(settings)
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

  const hasDataFolder = isDataDirectoryAvailable()

  if (!window.electronDesktop?.isElectron) {
    return null
  }

  return (
    <Modal
      title="Exit application?"
      open={exitOpen}
      layerClassName="z-[100]"
      onClose={() => !exitWorking && setExitOpen(false)}
    >
      <p className="text-sm text-slate-300">
        {hasDataFolder
          ? 'Sync to your data folder and exit?'
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
            Exit without syncing
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-50"
          disabled={exitWorking}
          onClick={() => void finishQuit(false)}
        >
          {exitWorking ? 'Syncing…' : 'Exit'}
        </button>
      </div>
    </Modal>
  )
}
