import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'it.sagra.gestionale',
  productName: 'Sagra della Pizza',
  directories: {
    buildResources: 'build',
    output: 'dist'
  },
  // electron-vite builds to out/ (main → out/main, preload → out/preload, renderer → out/renderer)
  files: ['out/**'],
  // better-sqlite3 ships a native .node binary — it cannot live inside the asar archive
  asarUnpack: ['**/*.node'],
  extraResources: [{ from: 'resources/', to: '.' }],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.png'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    installerIcon: 'build/icon.png',
    uninstallerIcon: 'build/icon.png'
  },
  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.business',
    icon: 'build/icon.png'
  }
}

export default config
