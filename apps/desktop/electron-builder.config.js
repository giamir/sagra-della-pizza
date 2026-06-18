/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'it.sagra.gestionale',
  productName: 'Sagra della Pizza',
  directories: {
    buildResources: 'build',
    output: 'dist'
  },
  files: ['out/**'],
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

module.exports = config
