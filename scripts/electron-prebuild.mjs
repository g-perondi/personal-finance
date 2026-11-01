import { rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactsDir = path.join(root, 'artifacts')

if (process.platform === 'win32') {
  for (const image of ['Personal Finance.exe', 'electron.exe']) {
    spawnSync('taskkill', ['/F', '/IM', image, '/T'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  }
}

async function removeArtifactsWithRetry(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await rm(artifactsDir, { recursive: true, force: true })
      return
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error ? error.code : null
      if (code !== 'EBUSY' && code !== 'EPERM') {
        throw error
      }
      if (attempt === maxAttempts) {
        console.error(
          'Could not clear artifacts/: close Personal Finance, Explorer windows on that folder, and any open files under release/ or artifacts/.',
        )
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
  }
}

await removeArtifactsWithRetry()
