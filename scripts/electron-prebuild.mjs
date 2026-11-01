import { cleanElectronBuildDirs, killDesktopAppProcesses } from './artifact-dirs.mjs'

killDesktopAppProcesses()
await cleanElectronBuildDirs({ warnOnly: true })
