import { useCallback, useEffect, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'

function isElectronShell(): boolean {
  return Boolean(window.electronDesktop?.isElectron)
}

export function ElectronDesktopTitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const desktop = window.electronDesktop
    if (!desktop?.onWindowMaximizedChange) {
      return
    }
    return desktop.onWindowMaximizedChange(setMaximized)
  }, [])

  const minimize = useCallback(() => {
    void window.electronDesktop?.minimizeWindow?.()
  }, [])

  const toggleMaximize = useCallback(() => {
    void window.electronDesktop?.toggleMaximizeWindow?.().then((next) => {
      if (typeof next === 'boolean') {
        setMaximized(next)
      }
    })
  }, [])

  const requestClose = useCallback(() => {
    window.electronDesktop?.requestCloseWindow?.()
  }, [])

  if (!isElectronShell()) {
    return null
  }

  return (
    <header className="electron-title-bar flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-3">
      <div className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
        <span className="font-semibold text-white">Personal Finance</span>
      </div>
      <div className="electron-title-bar-controls flex shrink-0 items-center">
        <button
          type="button"
          className="electron-title-bar-button"
          aria-label="Minimize"
          onClick={minimize}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="electron-title-bar-button"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={toggleMaximize}
        >
          <Square className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="electron-title-bar-button electron-title-bar-button-close"
          aria-label="Close"
          onClick={requestClose}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </header>
  )
}
