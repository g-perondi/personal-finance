import { contextBridge, ipcRenderer } from 'electron'

/** @type {Set<() => void>} */
const closeRequestHandlers = new Set()
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
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  requestCloseWindow: () => {
    ipcRenderer.send('window:request-close')
  },
  onWindowMaximizedChange: (handler) => {
    const listener = (_event, maximized) => {
      handler(Boolean(maximized))
    }
    ipcRenderer.on('window:maximized-changed', listener)
    return () => {
      ipcRenderer.removeListener('window:maximized-changed', listener)
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
