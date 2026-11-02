import { access, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve app.asar for Windows/Linux unpacked dirs or a macOS .app / mac-* folder.
 * @param {string} unpackedDir
 * @returns {Promise<string>}
 */
export async function resolveAsarPath(unpackedDir) {
  const candidates = [
    path.join(unpackedDir, 'resources', 'app.asar'),
    path.join(unpackedDir, 'Contents', 'Resources', 'app.asar'),
  ]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // try next
    }
  }

  let entries = []
  try {
    entries = await readdir(unpackedDir, { withFileTypes: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot read unpacked dir ${unpackedDir}: ${message}`, {
      cause: error,
    })
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.app')) {
      continue
    }
    const macAsar = path.join(
      unpackedDir,
      entry.name,
      'Contents',
      'Resources',
      'app.asar',
    )
    try {
      await access(macAsar)
      return macAsar
    } catch {
      // try next .app
    }
  }

  throw new Error(
    `ENOENT: no such file or directory, open '${path.join(unpackedDir, 'resources', 'app.asar')}' (also checked macOS .app Contents/Resources)`,
  )
}

/**
 * @param {string} unpackedDir absolute path to win-unpacked, mac-*, or .app
 */
export async function validateElectronUnpacked(unpackedDir) {
  const asarPath = await resolveAsarPath(unpackedDir)
  const errors = []

  let asarExtracted = false
  const { extractAll } = await import('@electron/asar')
  const tempExtract = path.join(unpackedDir, '.validate-asar-extract')
  try {
    await rm(tempExtract, { recursive: true, force: true })
    extractAll(asarPath, tempExtract)
    asarExtracted = true

    const packagePath = path.join(tempExtract, 'package.json')
    const packageRaw = await readFile(packagePath, 'utf8')
    try {
      const parsed = JSON.parse(packageRaw)
      if (parsed.main !== 'electron/main.mjs') {
        errors.push(
          `package.json main must be electron/main.mjs (got ${String(parsed.main)})`,
        )
      }
    } catch {
      errors.push('package.json is not valid JSON (pack is corrupt)')
    }

    const preloadPath = path.join(tempExtract, 'electron', 'preload.mjs')
    const preloadHead = (await readFile(preloadPath, 'utf8')).slice(0, 120)
    if (!preloadHead.includes('contextBridge')) {
      errors.push('electron/preload.mjs does not look like the desktop preload script')
    }
    if (
      preloadHead.includes('createMainWindow') ||
      preloadHead.includes('BrowserWindow')
    ) {
      errors.push('electron/preload.mjs appears to contain main-process code')
    }

    const mainPath = path.join(tempExtract, 'electron', 'main.mjs')
    const mainSource = await readFile(mainPath, 'utf8')
    if (
      !mainSource.includes('BrowserWindow') ||
      !mainSource.includes('createMainWindow')
    ) {
      errors.push('electron/main.mjs does not look like the main process entry')
    }

    const distIndex = path.join(tempExtract, 'dist', 'index.html')
    try {
      await readFile(distIndex, 'utf8')
    } catch {
      errors.push('dist/index.html is missing from the pack')
    }
  } finally {
    if (asarExtracted) {
      await rm(tempExtract, { recursive: true, force: true }).catch(() => {})
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid Electron pack under ${unpackedDir}:\n- ${errors.join('\n- ')}`,
    )
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const unpacked = process.argv[2]
  if (!unpacked) {
    console.error(
      'Usage: node scripts/validate-electron-pack.mjs <path-to-unpacked-or-app>',
    )
    process.exit(1)
  }
  await validateElectronUnpacked(path.resolve(unpacked))
  console.log('Electron pack validation OK')
}
