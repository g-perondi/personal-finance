import {
  clearDataDirectoryHandle,
  loadDataDirectoryHandle,
  saveDataDirectoryHandle,
} from '../../db/idb'

function isElectronDesktop(): boolean {
  return Boolean(window.electronDesktop?.isElectron)
}

let browserDirectoryHandle: FileSystemDirectoryHandle | null = null
let electronDataDirectoryPath: string | null = null
/** Prevents overlapping showDirectoryPicker calls (second call aborts the first). */
let activeDirectoryPick: Promise<string | null> | null = null

export function supportsBrowserDirectoryPicker(): boolean {
  return typeof window.showDirectoryPicker === 'function'
}

/** File System Access API is blocked inside iframes (e.g. IDE embedded preview). */
export function isEmbeddedAppFrame(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export function canUseBrowserDataDirectory(): boolean {
  return supportsBrowserDirectoryPicker() && !isEmbeddedAppFrame()
}

/** User dismissed the native folder dialog (not an app failure). */
function isDirectoryPickerUserAbort(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }
  if (error instanceof Error && /aborted a request/i.test(error.message)) {
    return true
  }
  return false
}

export async function restoreBrowserDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsBrowserDirectoryPicker()) {
    return null
  }
  const handle = await loadDataDirectoryHandle()
  browserDirectoryHandle = handle
  return handle
}

export function getBrowserDirectoryHandle(): FileSystemDirectoryHandle | null {
  return browserDirectoryHandle
}

export async function ensureBrowserDirectoryPermission(
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  const handle = browserDirectoryHandle
  if (!handle) {
    return false
  }
  const query = await handle.queryPermission({ mode })
  if (query === 'granted') {
    return true
  }
  const request = await handle.requestPermission({ mode })
  return request === 'granted'
}

export async function pickBrowserDataDirectory(): Promise<{
  handle: FileSystemDirectoryHandle
  displayName: string
} | null> {
  const displayName = await pickDataDirectoryFromUserGesture()
  if (!displayName || !browserDirectoryHandle) {
    return null
  }
  return { handle: browserDirectoryHandle, displayName }
}

async function persistPickedDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<string> {
  browserDirectoryHandle = handle
  const label = handle.name
  void saveDataDirectoryHandle(handle).catch((error: unknown) => {
    console.error('Failed to persist folder handle:', error)
  })
  return label
}

function pickBrowserDirectoryFromUserGesture(): Promise<string | null> {
  const pickerPromise = window.showDirectoryPicker!({ mode: 'readwrite' })
  return pickerPromise
    .then((handle) => persistPickedDirectoryHandle(handle))
    .catch((error: unknown) => {
      if (isDirectoryPickerUserAbort(error)) {
        return null
      }
      throw error
    })
}

/**
 * Opens the native folder picker. Must be invoked synchronously from a click
 * handler (call this function directly in the click handler, not after await).
 */
export function pickDataDirectoryFromUserGesture(): Promise<string | null> {
  if (activeDirectoryPick) {
    return activeDirectoryPick
  }

  let pick: Promise<string | null>
  if (isElectronDesktop()) {
    pick = Promise.resolve(window.electronDesktop?.pickDataDirectory?.()).then(
      (picked) => {
        electronDataDirectoryPath = picked ?? null
        if (picked) {
          void window.electronDesktop?.setDataDirectoryPath?.(picked)
        }
        return picked ?? null
      },
    )
  } else if (isEmbeddedAppFrame()) {
    pick = Promise.reject(
      new Error(
        'Folder picker does not work inside an embedded preview. Open this app in Chrome or Edge (top-level tab), or use the desktop app.',
      ),
    )
  } else if (!supportsBrowserDirectoryPicker()) {
    pick = Promise.reject(new Error('This browser does not support choosing a folder.'))
  } else {
    pick = pickBrowserDirectoryFromUserGesture()
  }

  activeDirectoryPick = pick.finally(() => {
    activeDirectoryPick = null
  })
  return activeDirectoryPick
}

export async function disconnectBrowserDataDirectory(): Promise<void> {
  browserDirectoryHandle = null
  await clearDataDirectoryHandle()
}

async function readFileBrowser(relativePath: string): Promise<ArrayBuffer | null> {
  if (!browserDirectoryHandle) {
    return null
  }
  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length === 0) {
    return null
  }
  let dir = browserDirectoryHandle
  for (let i = 0; i < parts.length - 1; i += 1) {
    try {
      dir = await dir.getDirectoryHandle(parts[i]!)
    } catch {
      return null
    }
  }
  try {
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1]!)
    const file = await fileHandle.getFile()
    return file.arrayBuffer()
  } catch {
    return null
  }
}

async function writeFileBrowser(
  relativePath: string,
  data: ArrayBuffer | Uint8Array,
): Promise<void> {
  if (!browserDirectoryHandle) {
    throw new Error('Data directory is not configured.')
  }
  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length === 0) {
    throw new Error('Invalid path')
  }
  let dir = browserDirectoryHandle
  for (let i = 0; i < parts.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(parts[i]!, { create: true })
  }
  const fileName = parts[parts.length - 1]!
  const fileHandle = await dir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  const chunk = data instanceof Uint8Array ? data : new Uint8Array(data)
  await writable.write(chunk)
  await writable.close()
}

async function removePathBrowser(relativePath: string): Promise<void> {
  if (!browserDirectoryHandle) {
    return
  }
  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length === 0) {
    return
  }
  let dir = browserDirectoryHandle
  for (let i = 0; i < parts.length - 1; i += 1) {
    try {
      dir = await dir.getDirectoryHandle(parts[i]!)
    } catch {
      return
    }
  }
  try {
    await dir.removeEntry(parts[parts.length - 1]!, { recursive: true })
  } catch {
    /* best effort */
  }
}

async function existsBrowser(relativePath: string): Promise<boolean> {
  const data = await readFileBrowser(relativePath)
  return data !== null
}

async function readFileElectron(relativePath: string): Promise<ArrayBuffer | null> {
  const desktop = window.electronDesktop
  if (!desktop?.readDataDirectoryFile) {
    return null
  }
  const result = await desktop.readDataDirectoryFile(relativePath)
  if (!result) {
    return null
  }
  if (result instanceof ArrayBuffer) {
    return result
  }
  return result
}

async function writeFileElectron(
  relativePath: string,
  data: ArrayBuffer | Uint8Array,
): Promise<void> {
  const desktop = window.electronDesktop
  if (!desktop?.writeDataDirectoryFile) {
    throw new Error('Data directory is not available.')
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  await desktop.writeDataDirectoryFile(relativePath, bytes)
}

async function removePathElectron(relativePath: string): Promise<void> {
  await window.electronDesktop?.removeDataDirectoryPath?.(relativePath)
}

async function existsElectron(relativePath: string): Promise<boolean> {
  return (
    (await window.electronDesktop?.dataDirectoryPathExists?.(relativePath)) ?? false
  )
}

export async function pickDataDirectory(): Promise<string | null> {
  return pickDataDirectoryFromUserGesture()
}

export async function readDataDirectoryFile(
  relativePath: string,
): Promise<ArrayBuffer | null> {
  if (isElectronDesktop()) {
    return readFileElectron(relativePath)
  }
  if (!(await ensureBrowserDirectoryPermission())) {
    return null
  }
  return readFileBrowser(relativePath)
}

export async function writeDataDirectoryFile(
  relativePath: string,
  data: ArrayBuffer | Uint8Array,
): Promise<void> {
  if (isElectronDesktop()) {
    await writeFileElectron(relativePath, data)
    return
  }
  if (!(await ensureBrowserDirectoryPermission())) {
    throw new Error('Cannot access data folder. Re-select it in Settings.')
  }
  await writeFileBrowser(relativePath, data)
}

export async function removeDataDirectoryPath(relativePath: string): Promise<void> {
  if (isElectronDesktop()) {
    await removePathElectron(relativePath)
    return
  }
  await removePathBrowser(relativePath)
}

export async function dataDirectoryPathExists(relativePath: string): Promise<boolean> {
  if (isElectronDesktop()) {
    return existsElectron(relativePath)
  }
  if (!(await ensureBrowserDirectoryPermission('read'))) {
    return false
  }
  return existsBrowser(relativePath)
}

export async function ensureDataDirectorySubdir(relativeDir: string): Promise<void> {
  const marker = `${relativeDir}/.keep`
  try {
    await writeDataDirectoryFile(marker, new Uint8Array())
    await removeDataDirectoryPath(marker)
  } catch {
    /* directory created by write */
  }
}

export function isDataDirectoryAvailable(): boolean {
  if (isElectronDesktop()) {
    return Boolean(electronDataDirectoryPath)
  }
  return browserDirectoryHandle !== null
}

export async function initDataDirectoryFromSettings(
  displayPath: string | null,
): Promise<void> {
  if (isElectronDesktop()) {
    if (displayPath) {
      await window.electronDesktop?.setDataDirectoryPath?.(displayPath)
      const resolved = await window.electronDesktop?.getDataDirectoryPath?.()
      electronDataDirectoryPath =
        typeof resolved === 'string' && resolved.trim() ? resolved : displayPath
    } else {
      const fromMain = await window.electronDesktop?.getDataDirectoryPath?.()
      electronDataDirectoryPath =
        typeof fromMain === 'string' && fromMain.trim() ? fromMain : null
    }
    return
  }
  await restoreBrowserDirectoryHandle()
}

/** Applies a picked folder to the runtime handle without persisting to app settings. */
export async function stageDataDirectoryPath(displayPath: string): Promise<string> {
  const trimmed = displayPath.trim()
  if (!trimmed) {
    throw new Error('Folder path is empty.')
  }
  if (isElectronDesktop()) {
    await window.electronDesktop?.setDataDirectoryPath?.(trimmed)
    const resolved = await window.electronDesktop?.getDataDirectoryPath?.()
    if (typeof resolved === 'string' && resolved.trim()) {
      electronDataDirectoryPath = resolved
      return resolved
    }
    electronDataDirectoryPath = trimmed
    return trimmed
  }
  if (!browserDirectoryHandle) {
    throw new Error('Folder handle is not available. Pick the folder again.')
  }
  const resolved = getDataDirectoryDisplayPath(trimmed)
  return resolved ?? trimmed
}

export async function restoreDataDirectoryFromSettings(
  settingsPath: string | null,
): Promise<void> {
  await initDataDirectoryFromSettings(settingsPath)
}

export async function disconnectDataDirectory(): Promise<void> {
  if (isElectronDesktop()) {
    electronDataDirectoryPath = null
    await window.electronDesktop?.setDataDirectoryPath?.(null)
    return
  }
  await disconnectBrowserDataDirectory()
}

export function isLikelyAbsolutePath(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.startsWith('\\\\')) {
    return true
  }
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return true
  }
  if (trimmed.startsWith('/')) {
    return true
  }
  return false
}

export async function resolveDataDirectoryDisplayPath(
  settingsPath: string | null,
): Promise<string | null> {
  if (isElectronDesktop()) {
    const fromMain = await window.electronDesktop?.getDataDirectoryPath?.()
    if (typeof fromMain === 'string' && fromMain.trim()) {
      electronDataDirectoryPath = fromMain
      return fromMain
    }
    if (electronDataDirectoryPath) {
      return electronDataDirectoryPath
    }
    if (settingsPath && isLikelyAbsolutePath(settingsPath)) {
      return settingsPath
    }
    return settingsPath
  }
  if (settingsPath && isLikelyAbsolutePath(settingsPath)) {
    return settingsPath
  }
  return browserDirectoryHandle?.name ?? settingsPath
}

export function getDataDirectoryDisplayPath(
  settingsPath: string | null,
): string | null {
  if (isElectronDesktop()) {
    if (electronDataDirectoryPath) {
      return electronDataDirectoryPath
    }
    if (settingsPath && isLikelyAbsolutePath(settingsPath)) {
      return settingsPath
    }
    return settingsPath
  }
  if (settingsPath && isLikelyAbsolutePath(settingsPath)) {
    return settingsPath
  }
  return browserDirectoryHandle?.name ?? settingsPath
}
