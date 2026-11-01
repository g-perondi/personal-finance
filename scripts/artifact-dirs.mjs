import { readdir, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const releaseDir = path.join(projectRoot, 'release')
export const artifactsDir = path.join(projectRoot, 'artifacts')
export const winUnpackedDir = path.join(artifactsDir, 'win-unpacked')

export function killDesktopAppProcesses() {
  if (process.platform !== 'win32') {
    return
  }
  for (const image of ['Personal Finance.exe', 'electron.exe']) {
    spawnSync('taskkill', ['/F', '/IM', image, '/T'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  }
}

export async function removeDirWithRetry(dirPath, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await rm(dirPath, { recursive: true, force: true })
      return true
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error ? error.code : null
      if (code === 'ENOENT') {
        return true
      }
      if (code !== 'EBUSY' && code !== 'EPERM') {
        throw error
      }
      if (attempt === maxAttempts) {
        return false
      }
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
  }
  return false
}

export async function removeStaleArtifactSiblingDirs({ warnOnly = false } = {}) {
  const entries = await readdir(projectRoot, { withFileTypes: true })
  const stale = entries.filter(
    (entry) => entry.isDirectory() && /^artifacts-.+/.test(entry.name),
  )
  let failed = false
  for (const entry of stale) {
    const dirPath = path.join(projectRoot, entry.name)
    const ok = await removeDirWithRetry(dirPath)
    if (ok) {
      if (!warnOnly) {
        console.log(`Removed ${entry.name}/`)
      }
      continue
    }
    failed = true
    const message = `Could not remove ${entry.name}/ (files in use). Close Personal Finance and File Explorer on that folder, then delete it manually.`
    if (warnOnly) {
      console.warn(message)
    } else {
      console.error(message)
    }
  }
  return !failed
}

export async function cleanElectronBuildDirs({ warnOnly = false } = {}) {
  let failed = !(await removeStaleArtifactSiblingDirs({ warnOnly }))
  for (const [label, dirPath] of [
    ['release/', releaseDir],
    ['artifacts/win-unpacked/', winUnpackedDir],
  ]) {
    const ok = await removeDirWithRetry(dirPath)
    if (ok) {
      if (!warnOnly) {
        console.log(`Removed ${label}`)
      }
      continue
    }
    failed = true
    const message = `Could not remove ${label} (files in use). Quit Personal Finance and close File Explorer on that path.`
    if (warnOnly) {
      console.warn(message)
    } else {
      console.error(message)
    }
  }
  return !failed
}
