import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronDesktop', {
  isElectron: true,
})
