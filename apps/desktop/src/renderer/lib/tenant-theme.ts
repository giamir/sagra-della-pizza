import tenantJson from '@sagra/shared/config/tenant.json'

// Only the theme bits are needed here; cast locally so this file doesn't pull
// the shared config types project into the renderer's tsconfig file list.
const tenant = tenantJson as {
  theme?: { tillAccent?: string; colors?: Record<string, string> }
}

// Remap Tailwind's `green-*` accent ramp to the tenant's primary colour so the
// till's accents (primary buttons, header, selected states) match the brand.
// The whole ramp is synthesized from `theme.colors.leaf` via color-mix; the
// dark-mode tints in app.css derive from these same vars, so both themes follow.
// Green stays the "confirm/success" accent — only its hue changes per tenant.
// Red / amber / blue (danger / warning / info) are intentionally left untouched.
export function applyTenantAccent(): void {
  // Dedicated till accent when set, else the web primary (leaf). Lets a tenant
  // give the till a brighter colour when its web primary reads too dark here.
  const accent = tenant.theme?.tillAccent ?? tenant.theme?.colors?.leaf
  if (!accent) return

  // The accent is anchored at the 600 step (where the till's primary buttons
  // live), so solid fills stay vividly brand-coloured. Lighter steps mix toward
  // white; only 700+ darken — and mildly, so a dark accent doesn't collapse the
  // ramp to near-black.
  const lighten = (pct: number) => `color-mix(in oklab, ${accent} ${pct}%, white)`
  const darken = (pct: number) => `color-mix(in oklab, ${accent} ${pct}%, black)`

  const ramp: Record<string, string> = {
    '--color-green-50': lighten(7),
    '--color-green-100': lighten(13),
    '--color-green-200': lighten(26),
    '--color-green-300': lighten(42),
    '--color-green-400': lighten(60),
    '--color-green-500': lighten(80),
    '--color-green-600': accent,
    '--color-green-700': darken(88),
    '--color-green-800': darken(78),
    '--color-green-900': darken(68),
    '--color-green-950': darken(54)
  }

  const root = document.documentElement
  for (const [name, value] of Object.entries(ramp)) {
    root.style.setProperty(name, value)
  }
}
