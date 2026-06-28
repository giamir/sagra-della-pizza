// Ad-hoc order adjustments (surplus / discount).
//
// A cashier can add an arbitrary-amount line to an order — a surplus (positive)
// or a discount (negative) — that isn't a catalog item. We carry it as a special
// cart-line key so the wire payload shape (lines: [key, qty][]) stays unchanged:
//
//   __adj||<signedCents>[||<urlencoded reason>]
//
// e.g. `__adj||-500` = −€5.00 (auto label "Sconto"),
//      `__adj||200||Sconto%20soci` = +€2.00 labelled "Sconto soci".
//
// The submit/print handlers parse these keys directly and never go through the
// generic decodeCartKey (which splits on the first `||` only).

export const ADJ_PREFIX = '__adj';

export function encodeAdjKey(cents: number, reason?: string): string {
  const r = reason?.trim();
  return r ? `${ADJ_PREFIX}||${cents}||${encodeURIComponent(r)}` : `${ADJ_PREFIX}||${cents}`;
}

export function isAdjKey(key: string): boolean {
  return key === ADJ_PREFIX || key.startsWith(`${ADJ_PREFIX}||`);
}

export function parseAdj(key: string): { cents: number; reason?: string } {
  const parts = key.split('||');
  const cents = Math.trunc(Number(parts[1]) || 0);
  const reason = parts[2] ? decodeURIComponent(parts[2]) : undefined;
  return { cents, reason };
}

// Fallback label when the cashier didn't type a reason.
export function adjLabel(cents: number): string {
  return cents < 0 ? 'Sconto' : 'Supplemento';
}
