import { useCallback, useEffect, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { isElectronApp, hasElectronDesktopBridge } from '../lib/electron-shell'

function isWindowsDesktopShell(): boolean {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
}

/** Matches AppShell sidebar width (`w-60`). */
const SIDEBAR_WIDTH_CLASS = 'w-60'

export function ElectronDesktopTitleBar() {
  const [maximized, setMaximized] = useState(false)
  const isWin = isWindowsDesktopShell()
  const showCustomWindowControls = hasElectronDesktopBridge() && !isWin

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

  if (!isElectronApp()) {
    return null
  }

  return (
    <header className="electron-title-bar flex shrink-0">
      <div
        className={`electron-title-bar-sidebar ${SIDEBAR_WIDTH_CLASS} shrink-0 bg-slate-900`}
        aria-hidden
      />
      <div
        className={`electron-title-bar-main flex min-w-0 flex-1 bg-slate-950${
          isWin ? 'electron-title-bar-win-controls' : ''
        }`}
      >
        {showCustomWindowControls ? (
          <div className="electron-title-bar-controls ml-auto flex shrink-0 items-center">
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
        ) : null}
      </div>
    </header>
  )
}
