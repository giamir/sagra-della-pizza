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
 *
 * x64-only: the GitHub runner's node-gyp can't locate an x86 VS toolchain, so
 * a 32-bit (ia32) rebuild of better-sqlite3 fails. Add ia32 back only if a real
 * 32-bit Windows 7 till turns up (needs the x86 build tools on the runner).
 *
 * @type {import('electron-builder').Configuration}
 */
const config = {
  ...base,
  // Don't rebuild native modules during packaging. The CI postinstall step
  // (electron-builder install-app-deps) already fetched a better-sqlite3 binary
  // for the pinned Electron 22 x64 ABI. Recompiling here would force node-gyp,
  // and the runner's bundled node-gyp can't detect VS2022 ("Could not find any
  // Visual Studio installation"). Reuse the working binary instead.
  npmRebuild: false,
  publish: [
    {
      provider: 'generic',
      url: 'https://sagradellapizza.it/desktop-updates',
      channel: 'win7-latest'
    }
  ],
  win: {
    ...base.win,
    target: [{ target: 'nsis', arch: ['x64'] }]
  },
  nsis: {
    ...base.nsis,
    artifactName: '${productName}-${version}-win7-${arch}.${ext}'
  }
}

module.exports = config
