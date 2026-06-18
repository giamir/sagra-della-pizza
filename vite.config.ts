import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { resolve } from 'path';

const sharedSrc = resolve(__dirname, 'shared/src');

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: {
      '@sagra/shared/types': resolve(sharedSrc, 'types.ts'),
      '@sagra/shared/utils/payload': resolve(sharedSrc, 'utils/payload.ts'),
      '@sagra/shared/utils/pricing': resolve(sharedSrc, 'utils/pricing.ts'),
      '@sagra/shared/utils/currency': resolve(sharedSrc, 'utils/currency.ts'),
      '@sagra/shared/data/menu.json': resolve(sharedSrc, 'data/menu.json')
    }
  },
  server: {
    allowedHosts: ['.loca.lt']
  },
  preview: {
    allowedHosts: ['.loca.lt']
  }
});
