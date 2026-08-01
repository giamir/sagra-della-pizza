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
- `theme.tillAccent` — optional. Accent for the desktop till's `green-*` ramp (primary buttons,
  header, selected states). Defaults to `colors.leaf`; set it when the web primary is too dark/muted
  to read well in the till (e.g. Sorsi e Morsi uses a bright orange so the till isn't near-black).
- `locale` — `lang`, `intl` (number/date locale), `currency`.
- `receipt` — `headerLines`, `customerCopyLabel`, `footerLines` (printed on tickets/receipts).
- `stations` — `order` (print order), `copertoStation`, `aliases` (legacy→canonical station names).
- `network` — `serverPort`, `defaultTillName`.
- `features` — optional toggles; **every flag defaults to enabled when omitted**, so existing
  tenants need no changes. `qr: false` makes the web app menu-only (the flow stops at the
  riepilogo). `coperto: false` removes the cover charge concept entirely — no Persone step in the
  web wizard, no Coperto line on the riepilogo, no Coperto row or catalog tab in the till, no
  coperti on tickets; orders are stored with `people = 0`, which is what keeps the charge out of
  every total. Use it for events without table service (e.g. `bigne`).
- `storagePrefix` — namespaces web localStorage keys (kept `sagra` for the existing install).
- `desktop` — `appId`, `productName`, `author`, `updateFeedUrl`, `downloadPageUrl`.

The cover charge *amount* is **single-sourced** from `menu.json` (`coperto.perPersona`); the UI
and receipts derive from it — do not duplicate it in `tenant.json`. Whether the cover charge
exists at all is a separate question, answered by `features.coperto` above. Set `perPersona: 0`
too when you disable it (the key is required by the `Menu` type), but the flag is what does the
real work: the amount is editable at runtime from the till's Catalogo, so a zero there is not a
durable guarantee.

### Menu structure drives the ordering flow

The customer ordering flow (`/ordina/...`) is generated from `menu.json`: each category becomes
a step in the wizard and the step nav, in array order, bookended by Persone and Riepilogo. So you
define your own categories/items freely — no route changes needed. Each category supports an
optional `subtitle` shown under its title. The QR encodes item IDs, so once the menu is shared by
web + desktop the QR flow works as-is.

**Desktop station routing:** the per-item → station map is seeded for the Sagra item IDs only. For
a new menu, open the desktop ☰ → Catalogo and assign each item to one of your `stations` (otherwise
items default to "Altro" on prep tickets). These overrides are stored in the till DB.

## 2. Activate the tenant

```
npm run use-tenant <slug>
```

This copies the overlay over the active files. Run it before every build/deploy for that
association. It is idempotent. CI for a given association should run it as the first build step.

Note it only *overwrites* — files left in `static/` by a previously activated tenant (e.g. the
other association's logo) are not deleted. Harmless, but don't be surprised by them.

## 2b. Register the tenant in CI

The tenant list is enumerated in the workflows, so a new overlay is invisible to CI until you
add it in **both** places:

- `.github/workflows/deploy.yml` — the `prepare` job's `jq` matrix, plus a
  `VERCEL_PROJECT_ID_<NAME>` repo variable holding the new Vercel project's ID.
- `.github/workflows/build.yml` — **all three** matrices (`build-mac`, `build-win`,
  `build-win7`), plus a `BLOB_READ_WRITE_TOKEN_<NAME>` repo secret for the tenant's Blob store
  (that's where installers and the update feed land).

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

- Generic UI microcopy outside the menu (button labels, the persone/riepilogo step headers).
- Date/time formatting locale in the desktop Reports/About panels (`it-IT`).
- The desktop **gestionale** renderer uses a neutral gray light/dark admin palette; only its accent
  ramp follows the brand (via `theme.tillAccent`, falling back to `colors.leaf`). The surfaces and
  the carefully-tuned dark mode stay neutral.
- `apps/desktop/src/renderer/index.html` window title ("Gestionale Sagra"); the installed app
  name comes from `tenant.desktop.productName`.
