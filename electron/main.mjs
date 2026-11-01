import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Menu } from 'electron'

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
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error)
              } else {
                closeResolve()
              }
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

async function createMainWindow() {
  const isDev = process.env.ELECTRON_DEV === '1'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Personal Finance',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(currentDir, 'preload.mjs'),
    },
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
