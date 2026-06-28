import { tenant } from '$lib/config/tenant';

// Per-tenant PWA manifest, generated from the active tenant config so each
// association ships its own name/colors/icons without editing static files.
// Prerendered to a static asset at build time.
export const prerender = true;

export function GET() {
  const manifest = {
    name: `${tenant.brand.name} ${tenant.brand.location}`,
    short_name: tenant.brand.shortName,
    description: `Ordina alla ${tenant.brand.name} di ${tenant.brand.location} anche senza connessione.`,
    lang: tenant.locale.lang,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: tenant.theme.backgroundColor,
    theme_color: tenant.theme.themeColor,
    orientation: 'portrait-primary',
    categories: ['food', 'shopping'],
    shortcuts: [
      {
        name: 'Apri interfaccia cassa',
        short_name: 'Cassa',
        description: 'Scansiona e verifica gli ordini alla cassa.',
        url: '/cassa',
        icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }]
      }
    ],
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'content-type': 'application/manifest+json' }
  });
}
