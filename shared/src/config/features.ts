// Resolved feature flags for the active tenant, shared by the customer web app
// and the desktop gestionale. Every flag defaults to ENABLED when the key is
// absent from tenant.json, so existing tenants keep their behaviour without
// touching their config. This is the only place that default lives — import
// from here rather than re-deriving `features?.x !== false` per call site.
import tenantJson from './tenant.json';
import type { TenantConfig } from './types.js';

const tenant = tenantJson as TenantConfig;

/** Whether the order flow ends with the QR step. When false the web app is
 *  menu-only and stops at the riepilogo (e.g. tenants without a till). */
export const qrEnabled: boolean = tenant.features?.qr !== false;

/** Whether the per-person cover charge exists at all. When false there is no
 *  Persone step in the web wizard, no Coperto line on the riepilogo, no Coperto
 *  row/tab in the till and no coperti on printed tickets; orders are stored with
 *  `people = 0`, which is what keeps the charge out of every total. */
export const copertoEnabled: boolean = tenant.features?.coperto !== false;
