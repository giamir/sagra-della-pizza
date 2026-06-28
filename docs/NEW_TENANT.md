# Onboarding a new association (tenant)

This app was built for the **Sagra della Pizza** (Orentano) but is config-driven so
another Italian association running a festival can reuse it without code changes. Each
association is a **separate deploy** (own Vercel site + own desktop build) selected by an
"active tenant" set of files. The default/committed tenant is `sagra-della-pizza`.

## 1. Create the tenant overlay

Copy the reference overlay and edit it:

```
cp -r tenants/sagra-della-pizza tenants/<slug>
```

Overlay layout (`tenants/<slug>/`):

| File / dir            | Activated to                     | What it is                              |
|-----------------------|----------------------------------|-----------------------------------------|
| `tenant.json`         | `shared/src/config/tenant.json`  | branding, theme, receipt, stations, network, desktop packaging |
| `menu.json`           | `shared/src/data/menu.json`      | the menu (items, prices, `coperto.perPersona`) |
| `assets/*`            | `static/*`                       | web logo, favicon, PWA icons            |
| `desktop/*`           | `apps/desktop/resources/*`       | desktop app `icon.ico`, `icon.icns`, runtime `logo.png` |

### `tenant.json` fields

See `shared/src/config/types.ts` (`TenantConfig`) for the full typed schema. Key fields:

- `id` — the slug (must match the folder name).
- `brand` — `name`, `location`, `shortName`, `tagline`, `logo` (path under `/static`), `logoAlt`.
- `theme.colors` — palette keyed by CSS var name without `--color-` (e.g. `leaf`, `tomato-dark`);
  overrides the Tailwind `@theme` defaults in `src/app.css` for the customer web app.
- `theme.themeColor` / `backgroundColor` — PWA + browser chrome.
- `locale` — `lang`, `intl` (number/date locale), `currency`.
- `receipt` — `headerLines`, `customerCopyLabel`, `footerLines` (printed on tickets/receipts).
- `stations` — `order` (print order), `copertoStation`, `aliases` (legacy→canonical station names).
- `network` — `serverPort`, `defaultTillName`.
- `storagePrefix` — namespaces web localStorage keys (kept `sagra` for the existing install).
- `desktop` — `appId`, `productName`, `author`, `updateFeedUrl`, `downloadPageUrl`.

The cover charge is **single-sourced** from `menu.json` (`coperto.perPersona`); the UI and
receipts derive from it — do not duplicate it in `tenant.json`.

## 2. Activate the tenant

```
npm run use-tenant <slug>
```

This copies the overlay over the active files. Run it before every build/deploy for that
association. It is idempotent. CI for a given association should run it as the first build step.

## 3. Deploy the web app (Vercel)

- Activate the tenant, then `npm run build`.
- Give the association its own Vercel project + domain. localStorage is isolated per domain.

## 4. Build the desktop app

- Packaging identity (`appId`, `productName`, update feed) comes from `tenant.desktop.*` via
  `apps/desktop/electron-builder.js`.
- `npm run -w @sagra/desktop package:mac` / `package:win` (after `use-tenant`).
- Windows 7 legacy build uses `electron-builder.legacy.js` (channel `win7-latest`), inheriting
  the tenant feed URL.
- Host the update feed at `tenant.desktop.updateFeedUrl` and the installers behind
  `tenant.desktop.downloadPageUrl`.

## 5. Keeping the menu in sync (important)

The menu is **baked per-tenant**: the web app and the desktop seed from the same `menu.json`,
which keeps QR item IDs aligned. The desktop catalog is editable in-app (☰ → Catalogo), but
**editing it there does NOT update the deployed web menu.** To re-sync after live edits:

1. Desktop: ☰ → Catalogo → **Esporta menu.json**
2. Copy the exported file into `tenants/<slug>/menu.json` (and re-run `use-tenant`)
3. Redeploy the web app

## What is intentionally NOT tenant-configurable yet

Target tenants are Italian associations, so the following stay hardcoded (would be addressed by a
future i18n pass, Phase 4):

- UI microcopy and category-page subtitles (e.g. "Cosa beviamo?") — generic Italian festival copy.
- Date/time formatting locale in the desktop Reports/About panels (`it-IT`).
- The desktop **gestionale** renderer uses a neutral light/dark admin palette (not brand colors),
  so `theme.colors` only restyle the customer web app.
- `apps/desktop/src/renderer/index.html` window title ("Gestionale Sagra"); the installed app
  name comes from `tenant.desktop.productName`.
