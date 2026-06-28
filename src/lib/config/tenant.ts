// Web-app view of the active tenant config. The JSON is swapped per association
// at deploy time (see tools/use-tenant.mjs); everything that used to be
// hardcoded "Sagra della Pizza / Orentano" branding now reads from here.
import tenantJson from '@sagra/shared/config/tenant.json';
import type { TenantConfig } from '@sagra/shared/config/types';
import menu from '@sagra/shared/data/menu.json';
import type { Menu } from '$lib/types';

export const tenant = tenantJson as TenantConfig;

/** Cover charge per person (EUR), single-sourced from the menu. */
export const copertoPerPersona: number = (menu as Menu).coperto?.perPersona ?? 0;

/** `:root { --color-…: … }` block built from the tenant palette, injected in
 *  the root layout so Tailwind's @theme defaults are overridden per tenant. */
export function themeCssVars(): string {
  const decls = Object.entries(tenant.theme.colors)
    .map(([name, value]) => `--color-${name}: ${value};`)
    .join(' ');
  return `:root { ${decls} }`;
}
