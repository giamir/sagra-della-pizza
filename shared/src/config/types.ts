// Per-tenant configuration shared by the customer web app and the desktop
// gestionale. One "active" tenant.json lives at ../config/tenant.json and is
// swapped per association at deploy time (see tools/use-tenant.mjs). The menu
// itself stays in ../data/menu.json — its `coperto.perPersona` is the single
// source for the cover charge, so it is intentionally NOT duplicated here.

export type TenantBrand = {
  /** Full festival/association name, e.g. "Sagra della Pizza". */
  name: string;
  /** Place/edition line shown under the name, e.g. "Orentano". */
  location: string;
  /** Short name for PWA / home-screen install. */
  shortName: string;
  /** One-line pitch on the landing page. */
  tagline: string;
  /** Logo path served from /static (absolute, e.g. "/logo.png"). */
  logo: string;
  /** Accessible label for the logo. */
  logoAlt: string;
};

export type TenantTheme = {
  /** Palette keyed by the CSS custom-property name without the `--color-` prefix
   *  (e.g. "leaf", "tomato-dark"), matching the @theme block in src/app.css. */
  colors: Record<string, string>;
  /** PWA + browser chrome color. */
  themeColor: string;
  /** PWA background color. */
  backgroundColor: string;
  /** Optional accent for the desktop till's `green-*` ramp (primary buttons,
   *  header, selected states). Falls back to `colors.leaf` when omitted. Use it
   *  when the web primary colour is too dark/muted to read well in the till. */
  tillAccent?: string;
};

export type TenantLocale = {
  /** BCP-47 language for <html lang> and the manifest. */
  lang: string;
  /** Intl locale for number/date formatting, e.g. "it-IT". */
  intl: string;
  /** ISO 4217 currency code, e.g. "EUR". */
  currency: string;
};

export type TenantReceipt = {
  /** Centered header lines printed at the top of every ticket/receipt. */
  headerLines: string[];
  /** Label printed on the courtesy (customer) receipt copy. */
  customerCopyLabel: string;
  /** Centered footer lines printed at the bottom of the courtesy receipt. */
  footerLines: string[];
};

export type TenantStations = {
  /** Canonical print order of kitchen stations. */
  order: string[];
  /** Station the per-person cover charge is routed to. */
  copertoStation: string;
  /** Legacy/alias station names mapped to canonical ones. */
  aliases: Record<string, string>;
};

export type TenantNetwork = {
  /** Default LAN port for the desktop host server. */
  serverPort: number;
  /** Default till display name. */
  defaultTillName: string;
};

export type TenantDesktop = {
  /** Bundle / appId for electron-builder, e.g. "it.sagra.gestionale". */
  appId: string;
  /** Installed product name. */
  productName: string;
  /** Publisher/author. */
  author: string;
  /** electron-updater feed URL. */
  updateFeedUrl: string;
  /** Public download page URL surfaced in the About/Updates panel. */
  downloadPageUrl: string;
};

export type TenantConfig = {
  /** Stable slug, e.g. "orentano". Also used to namespace storage keys. */
  id: string;
  brand: TenantBrand;
  theme: TenantTheme;
  locale: TenantLocale;
  receipt: TenantReceipt;
  stations: TenantStations;
  network: TenantNetwork;
  /** localStorage key prefix; kept as "sagra" for Orentano to preserve installs. */
  storagePrefix: string;
  desktop: TenantDesktop;
};
