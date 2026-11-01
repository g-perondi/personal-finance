import { contextBridge, ipcRenderer } from 'electron'

/** @type {Set<() => void>} */
const closeRequestHandlers = new Set()
/** @type {(() => Promise<void>) | null} */
let quitPrepHandler = null
let pendingCloseRequest = false

ipcRenderer.on('app:request-close', () => {
  if (closeRequestHandlers.size === 0) {
    pendingCloseRequest = true
    return
  }
  for (const handler of closeRequestHandlers) {
    handler()
  }
})

ipcRenderer.on('app:quit-prep', () => {
  void (async () => {
    try {
      if (quitPrepHandler) {
        await quitPrepHandler()
      }
      ipcRenderer.send('app:quit-prep-done')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      ipcRenderer.send('app:quit-prep-failed', message)
    }
  })()
})

contextBridge.exposeInMainWorld('electronDesktop', {
  isElectron: true,
  pickDataDirectory: () => ipcRenderer.invoke('data-directory:pick'),
  getDataDirectoryPath: () => ipcRenderer.invoke('data-directory:get-path'),
  setDataDirectoryPath: (nextPath) =>
    ipcRenderer.invoke('data-directory:set-path', nextPath),
  readDataDirectoryFile: (relativePath) =>
    ipcRenderer.invoke('data-directory:read-file', relativePath),
  writeDataDirectoryFile: (relativePath, data) =>
    ipcRenderer.invoke('data-directory:write-file', relativePath, data),
  removeDataDirectoryPath: (relativePath) =>
    ipcRenderer.invoke('data-directory:remove', relativePath),
  dataDirectoryPathExists: (relativePath) =>
    ipcRenderer.invoke('data-directory:exists', relativePath),
  saveBackupZipAs: (defaultFileName, data) =>
    ipcRenderer.invoke('backup:save-as', defaultFileName, data),
  quit: () => ipcRenderer.invoke('app:quit'),
  registerQuitPrep: (handler) => {
    quitPrepHandler = handler
    return () => {
      if (quitPrepHandler === handler) {
        quitPrepHandler = null
      }
    }
  },
  onRequestClose: (handler) => {
    closeRequestHandlers.add(handler)
    if (pendingCloseRequest) {
      pendingCloseRequest = false
      handler()
    }
    return () => {
      closeRequestHandlers.delete(handler)
    }
  },
})
