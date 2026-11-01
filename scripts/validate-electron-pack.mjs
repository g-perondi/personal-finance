import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @param {string} unpackedDir absolute path to win-unpacked (or equivalent)
 */
export async function validateElectronUnpacked(unpackedDir) {
  const asarPath = path.join(unpackedDir, 'resources', 'app.asar')
  const errors = []

  let asarExtracted = false
  const { extractAll } = await import('@electron/asar')
  const tempExtract = path.join(unpackedDir, '.validate-asar-extract')
  try {
    const { rm } = await import('node:fs/promises')
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
      const { rm } = await import('node:fs/promises')
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
      'Usage: node scripts/validate-electron-pack.mjs <path-to-win-unpacked>',
    )
    process.exit(1)
  }
  await validateElectronUnpacked(path.resolve(unpacked))
  console.log('Electron pack validation OK')
}
