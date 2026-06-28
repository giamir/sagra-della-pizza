import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedSrc = resolve(__dirname, 'shared/src');

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      '@sagra/shared/types': resolve(sharedSrc, 'types.ts'),
      '@sagra/shared/utils/payload': resolve(sharedSrc, 'utils/payload.ts'),
      '@sagra/shared/utils/pricing': resolve(sharedSrc, 'utils/pricing.ts'),
      '@sagra/shared/utils/currency': resolve(sharedSrc, 'utils/currency.ts'),
      '@sagra/shared/data/menu.json': resolve(sharedSrc, 'data/menu.json'),
      '@sagra/shared/config/types': resolve(sharedSrc, 'config/types.ts'),
      '@sagra/shared/config/tenant.json': resolve(sharedSrc, 'config/tenant.json')
    }
  }
};

export default config;
