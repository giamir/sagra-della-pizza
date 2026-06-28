const path = require('path')
const tenant = require('../../shared/src/config/tenant.json')

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: tenant.desktop.appId,
  productName: tenant.desktop.productName,
  publish: [
    {
      provider: 'generic',
      url: tenant.desktop.updateFeedUrl
    }
  ],
  directories: {
    buildResources: 'build',
    output: 'dist'
  },
  files: ['out/**'],
  asarUnpack: ['**/*.node'],
  // Ship only the runtime logo; icon.icns/icon.ico are build-time only and
  // would collide with the app icon electron-builder writes to Resources/.
  extraResources: [{ from: 'resources/', to: '.', filter: ['**/*', '!icon.icns', '!icon.ico'] }],
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
