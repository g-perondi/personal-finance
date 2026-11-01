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
          'Could not clear artifacts/: quit Personal Finance, close any file manager on that folder, and retry.',
        )
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
  }
}

await removeArtifactsWithRetry()
