import { cleanElectronBuildDirs, killDesktopAppProcesses } from './artifact-dirs.mjs'

killDesktopAppProcesses()
const ok = await cleanElectronBuildDirs({ warnOnly: false })
process.exit(ok ? 0 : 1)
