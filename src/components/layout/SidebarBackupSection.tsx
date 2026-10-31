import { useRef, useState, type ChangeEvent } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { clearAllLocalData } from '../../db/database'
import { exportBackupZip, importBackupZip } from '../../lib/backup'

const CLEAR_DATA_CONFIRM_PHRASE = 'clear all data'

export function SidebarBackupSection() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearConfirmText, setClearConfirmText] = useState('')

  async function handleExport() {
    setExportError(null)
    setExporting(true)
    try {
      await exportBackupZip()
    } catch (error: unknown) {
      setExportError(
        error instanceof Error ? error.message : 'Unable to create backup.',
      )
    } finally {
      setExporting(false)
    }
  }

  function handleRestoreClick() {
    setRestoreError(null)
    fileInputRef.current?.click()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) {
      return
    }
    setPendingFile(file)
    setRestoreOpen(true)
  }

  function closeRestoreModal() {
    if (restoring) {
      return
    }
    setRestoreOpen(false)
    setPendingFile(null)
    setRestoreError(null)
  }

  async function confirmRestore() {
    if (!pendingFile) {
      return
    }
    setRestoreError(null)
    setRestoring(true)
    try {
      await importBackupZip(pendingFile)
    } catch (error: unknown) {
      setRestoreError(
        error instanceof Error ? error.message : 'Unable to restore backup.',
      )
      setRestoring(false)
    }
  }

  async function confirmClear() {
    if (clearConfirmText !== CLEAR_DATA_CONFIRM_PHRASE) {
      return
    }
    setClearError(null)
    setClearing(true)
    try {
      await clearAllLocalData()
    } catch (error: unknown) {
      setClearError(error instanceof Error ? error.message : 'Unable to clear data.')
      setClearing(false)
    }
  }

  function closeClearModal() {
    if (clearing) {
      return
    }
    setClearOpen(false)
    setClearError(null)
    setClearConfirmText('')
  }

  const actionClass =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <>
      <div className="mt-auto border-t border-slate-800 pt-4">
        <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
          Local data
        </p>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={actionClass}
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            <Download className="size-3.5 shrink-0" aria-hidden />
            {exporting ? 'Creating backup…' : 'Download backup'}
          </button>
          <button
            type="button"
            className={actionClass}
            disabled={restoring}
            onClick={handleRestoreClick}
          >
            <Upload className="size-3.5 shrink-0" aria-hidden />
            Restore backup
          </button>
          <button
            type="button"
            className={`${actionClass} text-red-400/90 hover:text-red-300`}
            disabled={clearing || exporting || restoring}
            onClick={() => {
              setClearError(null)
              setClearConfirmText('')
              setClearOpen(true)
            }}
          >
            <Trash2 className="size-3.5 shrink-0" aria-hidden />
            Clear all data
          </button>
        </div>
        {exportError ? (
          <p className="mt-2 px-3 text-xs text-red-400" role="alert">
            {exportError}
          </p>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          aria-hidden
          onChange={handleFileChange}
        />
      </div>

      <Modal title="Restore backup?" open={restoreOpen} onClose={closeRestoreModal}>
        <p className="text-sm text-slate-300">
          This replaces all accounts, transactions, categories, and documents on this
          device with the contents of{' '}
          <span className="font-medium text-white">
            {pendingFile?.name ?? 'the selected file'}
          </span>
          . You cannot undo this unless you have another backup.
        </p>
        {restoreError ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {restoreError}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
            disabled={restoring}
            onClick={closeRestoreModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            disabled={restoring || !pendingFile}
            onClick={() => void confirmRestore()}
          >
            {restoring ? 'Restoring…' : 'Replace all data'}
          </button>
        </div>
      </Modal>

      <Modal title="Clear all local data?" open={clearOpen} onClose={closeClearModal}>
        <p className="text-sm text-slate-300">
          This deletes every account, transaction, category, and document on this
          device, including uploaded files. The app will reload with an empty database.
          Download a backup first if you need to keep anything.
        </p>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm text-slate-400">
            Type{' '}
            <span className="font-mono text-slate-200">
              {CLEAR_DATA_CONFIRM_PHRASE}
            </span>{' '}
            to confirm
          </span>
          <input
            type="text"
            value={clearConfirmText}
            onChange={(event) => setClearConfirmText(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
            disabled={clearing}
          />
        </label>
        {clearError ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {clearError}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
            disabled={clearing}
            onClick={closeClearModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            disabled={clearing || clearConfirmText !== CLEAR_DATA_CONFIRM_PHRASE}
            onClick={() => void confirmClear()}
          >
            {clearing ? 'Clearing…' : 'Delete everything'}
          </button>
        </div>
      </Modal>
    </>
  )
}
