import { contextBridge, ipcRenderer } from 'electron'

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
  onRequestClose: (handler) => {
    const listener = () => {
      handler()
    }
    ipcRenderer.on('app:request-close', listener)
    return () => {
      ipcRenderer.removeListener('app:request-close', listener)
    }
  },
})
