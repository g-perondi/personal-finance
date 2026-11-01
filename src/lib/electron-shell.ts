export function isElectronUserAgent(): boolean {
  return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
}

export function hasElectronDesktopBridge(): boolean {
  return Boolean(window.electronDesktop?.isElectron)
}

/** True in the desktop app (even if preload failed to expose the bridge). */
export function isElectronApp(): boolean {
  return hasElectronDesktopBridge() || isElectronUserAgent()
}
