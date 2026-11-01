import { createServer } from 'node:http'
import { readFile, stat, writeFile, mkdir, rm, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ipcMain, app, BrowserWindow, Menu, dialog } from 'electron'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

/** Fixed port so IndexedDB origin stays `http://127.0.0.1:39217` across restarts. */
const PROD_STATIC_PORT = 39_217

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

function getDistDir() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist')
  }
  return path.join(currentDir, '..', 'dist')
}

function startStaticServer(rootDir, port = PROD_STATIC_PORT) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        let relative = decodeURIComponent(url.pathname)
        if (relative === '/') {
          relative = '/index.html'
        }

        const safeRoot = path.resolve(rootDir)
        let filePath = path.resolve(safeRoot, `.${relative}`)
        if (!filePath.startsWith(safeRoot)) {
          res.writeHead(403)
          res.end()
          return
        }

        try {
          const info = await stat(filePath)
          if (info.isDirectory()) {
            filePath = path.join(safeRoot, 'index.html')
          }
        } catch {
          filePath = path.join(safeRoot, 'index.html')
        }

        const body = await readFile(filePath)
        const ext = path.extname(filePath).toLowerCase()
        res.writeHead(200, {
          'Content-Type': MIME_BY_EXT[ext] ?? 'application/octet-stream',
        })
        res.end(body)
      } catch {
        res.writeHead(500)
        res.end()
      }
    })

    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Static server failed to bind'))
        return
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((closeResolve) => {
            const done = () => {
              closeResolve()
            }
            const timer = setTimeout(done, 1000)
            server.closeAllConnections?.()
            server.close(() => {
              clearTimeout(timer)
              done()
            })
          }),
      })
    })
    server.on('error', reject)
  })
}

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null
/** @type {(() => Promise<void>) | null} */
let closeStaticServer = null
/** @type {string | null} */
let dataDirectoryPath = null
let appQuitting = false

async function finishAppQuit() {
  appQuitting = true
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.destroy()
    }
  }
  const closeServer = closeStaticServer
  closeStaticServer = null
  if (closeServer) {
    try {
      await closeServer()
    } catch {
      /* best effort */
    }
  }
  app.exit(0)
}

function notifyWindowMaximized(win) {
  if (win.isDestroyed()) {
    return
  }
  win.webContents.send('window:maximized-changed', win.isMaximized())
}

function resolveDataPath(relativePath) {
  if (!dataDirectoryPath) {
    throw new Error('Data directory is not configured.')
  }
  const safeRoot = path.resolve(dataDirectoryPath)
  const filePath = path.resolve(safeRoot, relativePath)
  if (!filePath.startsWith(safeRoot)) {
    throw new Error('Invalid path.')
  }
  return filePath
}

function registerDataDirectoryIpc() {
  ipcMain.handle('data-directory:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) {
      return null
    }
    dataDirectoryPath = path.resolve(result.filePaths[0])
    return dataDirectoryPath
  })

  ipcMain.handle('data-directory:get-path', () => dataDirectoryPath)

  ipcMain.handle('data-directory:set-path', (_, nextPath) => {
    dataDirectoryPath =
      typeof nextPath === 'string' && nextPath.trim()
        ? path.resolve(nextPath.trim())
        : null
    return dataDirectoryPath
  })

  ipcMain.handle('data-directory:read-file', async (_, relativePath) => {
    try {
      const filePath = resolveDataPath(String(relativePath))
      const data = await readFile(filePath)
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    } catch {
      return null
    }
  })

  ipcMain.handle('data-directory:write-file', async (_, relativePath, data) => {
    const filePath = resolveDataPath(String(relativePath))
    await mkdir(path.dirname(filePath), { recursive: true })
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    await writeFile(filePath, bytes)
  })

  ipcMain.handle('data-directory:remove', async (_, relativePath) => {
    try {
      const filePath = resolveDataPath(String(relativePath))
      await rm(filePath, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  })

  ipcMain.handle('data-directory:exists', async (_, relativePath) => {
    try {
      const filePath = resolveDataPath(String(relativePath))
      await access(filePath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('app:quit', async () => {
    await finishAppQuit()
  })

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return false
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
    notifyWindowMaximized(mainWindow)
    return mainWindow.isMaximized()
  })

  ipcMain.on('window:request-close', () => {
    if (appQuitting || !mainWindow || mainWindow.webContents.isDestroyed()) {
      return
    }
    mainWindow.webContents.send('app:request-close')
  })

  ipcMain.handle('backup:save-as', async (_, defaultFileName, data) => {
    const safeName =
      typeof defaultFileName === 'string' && defaultFileName.trim()
        ? path.basename(defaultFileName.trim())
        : 'personal-finance-backup.zip'
    let defaultDir
    if (dataDirectoryPath) {
      defaultDir = path.join(path.resolve(dataDirectoryPath), 'backups')
    } else {
      defaultDir = path.join(app.getPath('documents'), 'Personal Finance', 'backups')
    }
    await mkdir(defaultDir, { recursive: true })
    const defaultPath = path.join(defaultDir, safeName)
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [{ name: 'Backup ZIP', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePath) {
      return false
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    await writeFile(result.filePath, bytes)
    return true
  })
}

async function createMainWindow() {
  const isDev = process.env.ELECTRON_DEV === '1'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Personal Finance',
    frame: false,
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(currentDir, 'preload.mjs'),
    },
  })

  mainWindow.on('maximize', () => {
    if (mainWindow) {
      notifyWindowMaximized(mainWindow)
    }
  })
  mainWindow.on('unmaximize', () => {
    if (mainWindow) {
      notifyWindowMaximized(mainWindow)
    }
  })

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
  } else {
    const distDir = getDistDir()
    const { port, close } = await startStaticServer(distDir)
    closeStaticServer = close
    await mainWindow.loadURL(`http://127.0.0.1:${port}/`)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (appQuitting) {
      return
    }
    event.preventDefault()
    if (!mainWindow || mainWindow.webContents.isDestroyed()) {
      return
    }
    mainWindow.webContents.send('app:request-close')
  })

  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault()
  })

  notifyWindowMaximized(mainWindow)
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    registerDataDirectoryIpc()
    void createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    void closeStaticServer?.()
  })
}
