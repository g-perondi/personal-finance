import { spawnSync } from 'node:child_process'

function run(script) {
  const result = spawnSync('npm', ['run', script], {
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const platform = process.platform

if (platform === 'win32') {
  run('electron:build:win')
  console.log(
    '\nmacOS artifacts require macOS (npm run electron:build:mac) or the GitHub Actions "Electron build" workflow.',
  )
} else if (platform === 'darwin') {
  run('electron:build:mac')
  console.log(
    '\nWindows artifacts require Windows (npm run electron:build:win) or the GitHub Actions "Electron build" workflow.',
  )
} else {
  console.error(
    'Unsupported platform. Use electron:build:win on Windows, electron:build:mac on macOS, or GitHub Actions.',
  )
  process.exit(1)
}
