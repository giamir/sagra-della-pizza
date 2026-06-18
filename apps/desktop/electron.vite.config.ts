import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

const sharedSrc = resolve(__dirname, '../../shared/src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
