const path = require('path')

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'it.sagra.gestionale',
  productName: 'Sagra della Pizza',
  publish: [
    {
      provider: 'generic',
      url: 'https://sagradellapizza.it/desktop-updates'
    }
  ],
  directories: {
    buildResources: 'build',
    output: 'dist'
  },
  files: ['out/**'],
  asarUnpack: ['**/*.node'],
  extraResources: [{ from: 'resources/', to: '.' }],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: path.join(__dirname, 'resources', 'icon.ico')
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    installerIcon: path.join(__dirname, 'resources', 'icon.ico'),
    uninstallerIcon: path.join(__dirname, 'resources', 'icon.ico')
  },
  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] }
    ],
    category: 'public.app-category.business',
    icon: path.join(__dirname, 'resources', 'icon.icns')
  }
}

module.exports = config
