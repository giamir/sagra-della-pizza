const base = require('./electron-builder')

/**
 * Windows 7 / 8 / 8.1 build.
 *
 * Electron dropped Windows 7 support after v22, so this build is meant to be
 * packaged on top of an Electron 22.x install (the CI job pins it). Differences
 * from the default config:
 *   - separate auto-update channel (win7-latest.yml) so these machines never
 *     pull a modern-Electron release they can't run;
 *   - distinct artifact names so files don't collide with the default build in
 *     the same update folder;
 *   - 32-bit (ia32) target added — many surviving Windows 7 tills are 32-bit.
 *
 * @type {import('electron-builder').Configuration}
 */
const config = {
  ...base,
  // Rebuild native modules (better-sqlite3) from source against the pinned
  // Electron 22 ABI rather than reusing prebuilt binaries.
  npmRebuild: true,
  buildDependenciesFromSource: true,
  publish: [
    {
      provider: 'generic',
      url: 'https://sagradellapizza.it/desktop-updates',
      channel: 'win7-latest'
    }
  ],
  win: {
    ...base.win,
    target: [{ target: 'nsis', arch: ['ia32', 'x64'] }]
  },
  nsis: {
    ...base.nsis,
    artifactName: '${productName}-${version}-win7-${arch}.${ext}'
  }
}

module.exports = config
