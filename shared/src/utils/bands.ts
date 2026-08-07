// Fasce colore: an optional per-item colour token that paints a thin rounded
// bar on the till's menu tile, so a long list reads as a few coloured zones
// instead of one flat run of identical labels (same idea as Kontorno's bands).
//
// Presentational only: never printed, never stored on order lines. An item in
// menu.json either carries a token or it does not. The palette is a small
// closed set — a token, not a free hex — so rendering maps it through a static
// class record and an unknown value can never reach a class string.

/** The closed palette, in swatch order. */
export const BAND_COLOURS = [
  'lampone',
  'rame',
  'bruno',
  'ambra',
  'oliva',
  'verde',
  'smeraldo',
  'blu',
  'indaco',
  'viola',
  'ciclamino'
] as const;

export type BandColour = (typeof BAND_COLOURS)[number];

const BAND_SET: ReadonlySet<string> = new Set(BAND_COLOURS);

/** Narrow an untrusted value (menu.json, a till's saved catalog) to a known
 *  token. Anything else — unknown token, raw hex, non-string — becomes
 *  `undefined`, i.e. no band. */
export function normalizeBand(raw: unknown): BandColour | undefined {
  return typeof raw === 'string' && BAND_SET.has(raw) ? (raw as BandColour) : undefined;
}
