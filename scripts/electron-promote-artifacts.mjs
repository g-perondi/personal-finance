import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateElectronUnpacked } from './validate-electron-pack.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(root, 'release')
const artifactsDir = path.join(root, 'artifacts')

const releaseEntries = await readdir(releaseDir, { withFileTypes: true })
const portableExes = releaseEntries.filter(
  (entry) => entry.isFile() && entry.name.endsWith('.exe'),
)
const macArtifacts = releaseEntries.filter(
  (entry) =>
    entry.isFile() && (entry.name.endsWith('.dmg') || entry.name.endsWith('.zip')),
)
const toCopy = portableExes.length > 0 ? portableExes : macArtifacts

if (toCopy.length === 0) {
  console.error('No installer found in release/. Run electron-builder first.')
  process.exit(1)
}

const winUnpacked = path.join(releaseDir, 'win-unpacked')
try {
  await validateElectronUnpacked(winUnpacked)
  console.log('Electron pack validation OK')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

await mkdir(artifactsDir, { recursive: true })

const artifactEntries = await readdir(artifactsDir, { withFileTypes: true }).catch(
  () => [],
)
for (const entry of artifactEntries) {
  if (!entry.isFile()) {
    continue
  }
  if (
    entry.name.endsWith('.exe') ||
    entry.name.endsWith('.dmg') ||
    entry.name.endsWith('.zip')
  ) {
    await rm(path.join(artifactsDir, entry.name), { force: true })
  }
}

for (const entry of toCopy) {
  const from = path.join(releaseDir, entry.name)
  const to = path.join(artifactsDir, entry.name)
  await copyFile(from, to)
  console.log(`Copied ${entry.name} -> artifacts/`)
}

await rm(path.join(artifactsDir, 'win-unpacked'), {
  recursive: true,
  force: true,
}).catch(() => {})

await rm(releaseDir, { recursive: true, force: true })
console.log('Removed release/ staging folder.')
