import { resolveStockItemId } from '../catalog/catalog.js';

// Ephemeral, in-memory soft-holds (reservations) for items sitting in a till's
// cart but not yet paid. They are NOT persisted: a host restart clears them all.
// Each till keeps at most one reservation (its current cart). The effective
// "rimasti" shown across all tills = persisted remaining_qty − sum of holds.

type Reservation = { lines: Record<string, number>; updatedAt: number };

// A hold not refreshed within this window is assumed abandoned (cashier walked
// away, till crashed) and is dropped so the units return to circulation. Tills
// refresh their hold on every cart change and on a heartbeat well under the TTL.
const TTL_MS = 120_000;

const reservations = new Map<string, Reservation>();

// Collapses raw cart lines ([cartKey, qty]) into per-stock-id totals, resolving
// variants / option combos to their base stock id (same mapping as checkout).
function resolveLines(lines: [string, number][]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [key, qty] of lines) {
    if (qty <= 0) continue;
    const stockId = resolveStockItemId(key);
    totals[stockId] = (totals[stockId] ?? 0) + qty;
  }
  return totals;
}

// Replaces a till's hold with its current cart. An empty cart clears the hold.
export function setReservation(tillName: string, lines: [string, number][]): void {
  const totals = resolveLines(lines);
  if (Object.keys(totals).length === 0) {
    reservations.delete(tillName);
    return;
  }
  reservations.set(tillName, { lines: totals, updatedAt: Date.now() });
}

export function clearReservation(tillName: string): void {
  reservations.delete(tillName);
}

function prune(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [till, res] of reservations) {
    if (res.updatedAt < cutoff) reservations.delete(till);
  }
}

// Total reserved quantity per stock id across all (non-stale) tills.
export function getReservedTotals(): Record<string, number> {
  prune();
  const totals: Record<string, number> = {};
  for (const res of reservations.values()) {
    for (const [stockId, qty] of Object.entries(res.lines)) {
      totals[stockId] = (totals[stockId] ?? 0) + qty;
    }
  }
  return totals;
}
