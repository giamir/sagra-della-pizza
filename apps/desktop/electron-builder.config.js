/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'it.sagra.gestionale',
  productName: 'Sagra della Pizza',
  publish: null,
  directories: {
    buildResources: 'build',
    output: 'dist'
  },
  files: ['out/**'],
  asarUnpack: ['**/*.node'],
  extraResources: [{ from: 'resources/', to: '.' }],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/logo.png'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    installerIcon: 'resources/logo.png',
    uninstallerIcon: 'resources/logo.png'
  },
  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] }
    ],
    category: 'public.app-category.business',
    icon: 'resources/icon.icns'
  }
}

module.exports = config
