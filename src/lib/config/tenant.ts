// Web-app view of the active tenant config. The JSON is swapped per association
// at deploy time (see tools/use-tenant.mjs); everything that used to be
// hardcoded "Sagra della Pizza / Orentano" branding now reads from here.
import tenantJson from '@sagra/shared/config/tenant.json';
import type { TenantConfig } from '@sagra/shared/config/types';
import menu from '@sagra/shared/data/menu.json';
import type { Menu } from '$lib/types';

export const tenant = tenantJson as TenantConfig;

/** Whether the order flow ends with the QR step. When false the app is
 *  menu-only and stops at the riepilogo (e.g. tenants without a till). */
export const qrEnabled: boolean = tenant.features?.qr !== false;

/** Cover charge per person (EUR), single-sourced from the menu. */
export const copertoPerPersona: number = (menu as Menu).coperto?.perPersona ?? 0;

/** localStorage key namespaced by the tenant, e.g. storageKey('order-v1'). */
export function storageKey(suffix: string): string {
  return `${tenant.storagePrefix}-${suffix}`;
}

/** `:root { --color-…: … }` block built from the tenant palette, injected in
 *  the root layout so Tailwind's @theme defaults are overridden per tenant. */
export function themeCssVars(): string {
  const decls = Object.entries(tenant.theme.colors)
    .map(([name, value]) => `--color-${name}: ${value};`)
    .join(' ');
  return `:root { ${decls} }`;
}
