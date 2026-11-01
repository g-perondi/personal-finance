/// <reference types="vite/client" />

declare module '*.sql?raw' {
  const content: string
  export default content
}

interface ElectronDesktopApi {
  isElectron: boolean
  pickDataDirectory?: () => Promise<string | null>
  getDataDirectoryPath?: () => Promise<string | null> | string | null
  setDataDirectoryPath?: (path: string | null) => Promise<string | null> | void
  readDataDirectoryFile?: (relativePath: string) => Promise<ArrayBuffer | null>
  writeDataDirectoryFile?: (relativePath: string, data: Uint8Array) => Promise<void>
  removeDataDirectoryPath?: (relativePath: string) => Promise<void>
  dataDirectoryPathExists?: (relativePath: string) => Promise<boolean>
  saveBackupZipAs?: (defaultFileName: string, data: Uint8Array) => Promise<boolean>
  quit?: () => Promise<void>
  minimizeWindow?: () => Promise<void>
  toggleMaximizeWindow?: () => Promise<boolean>
  requestCloseWindow?: () => void
  onWindowMaximizedChange?: (handler: (maximized: boolean) => void) => () => void
  onRequestClose?: (handler: () => void) => () => void
}

interface Window {
  electronDesktop?: ElectronDesktopApi
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite'
    id?: string
  }) => Promise<FileSystemDirectoryHandle>
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
    startIn?: FileSystemDirectoryHandle
  }) => Promise<FileSystemFileHandle>
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface FileSystemWritableFileStream {
  write(data: BufferSource): Promise<void>
  close(): Promise<void>
}

interface FileSystemDirectoryHandle {
  queryPermission(descriptor?: {
    mode?: 'read' | 'readwrite'
  }): Promise<PermissionState>
  requestPermission(descriptor?: {
    mode?: 'read' | 'readwrite'
  }): Promise<PermissionState>
}
