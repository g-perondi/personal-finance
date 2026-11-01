/** Block the native context menu app-wide (desktop + browser build). */
export function installContextMenuBlock(): void {
  if (typeof document === 'undefined') {
    return
  }
  document.addEventListener(
    'contextmenu',
    (event) => {
      event.preventDefault()
    },
    { capture: true },
  )
}
