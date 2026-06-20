import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

const sharedSrc = resolve(__dirname, '../../shared/src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // Baked-in auto-update channel. The default build ships on 'latest';
    // the Windows 7 / Electron 22 build sets SAGRA_UPDATE_CHANNEL=win7-latest
    // so those machines only ever see win7-latest.yml and never pull a
    // modern-Electron release that won't run on Windows 7.
    define: {
      __UPDATE_CHANNEL__: JSON.stringify(process.env.SAGRA_UPDATE_CHANNEL || 'latest')
    },
    resolve: {
      alias: {
        '@sagra/shared/types': resolve(sharedSrc, 'types.ts'),
        '@sagra/shared/utils/payload': resolve(sharedSrc, 'utils/payload.ts'),
        '@sagra/shared/utils/pricing': resolve(sharedSrc, 'utils/pricing.ts'),
        '@sagra/shared/utils/currency': resolve(sharedSrc, 'utils/currency.ts'),
        '@sagra/shared/data/menu.json': resolve(sharedSrc, 'data/menu.json')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [tailwindcss(), svelte()],
    resolve: {
      alias: {
        '@sagra/shared/types': resolve(sharedSrc, 'types.ts'),
        '@sagra/shared/utils/payload': resolve(sharedSrc, 'utils/payload.ts'),
        '@sagra/shared/utils/pricing': resolve(sharedSrc, 'utils/pricing.ts'),
        '@sagra/shared/utils/currency': resolve(sharedSrc, 'utils/currency.ts'),
        '@sagra/shared/data/menu.json': resolve(sharedSrc, 'data/menu.json'),
        $lib: resolve(__dirname, 'src/renderer/lib')
      }
    }
  }
})
