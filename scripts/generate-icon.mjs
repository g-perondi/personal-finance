import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const svg = await readFile(path.join(root, 'public/favicon.svg'))
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } })
const outDir = path.join(root, 'build')
await mkdir(outDir, { recursive: true })
await writeFile(path.join(outDir, 'icon.png'), resvg.render().asPng())
