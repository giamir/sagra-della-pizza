import { getDb } from './schema.js';

export type StockRow = { item_id: string; initial_qty: number; remaining_qty: number };

export function getStock(): Record<string, number> {
  const rows = getDb().prepare('SELECT item_id, remaining_qty FROM stock').all() as StockRow[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.item_id] = r.remaining_qty;
  return out;
}

export function setStock(itemId: string, qty: number): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO stock (item_id, initial_qty, remaining_qty) VALUES (?, ?, ?)')
    .run(itemId, qty, qty);
}

export function resetStock(itemId: string): void {
  getDb().prepare('DELETE FROM stock WHERE item_id = ?').run(itemId);
}

// Atomically decrement stock for all lines in an order.
// Returns an array of item IDs that were over their limit (order should be rejected).
export function decrementStock(
  db: import('better-sqlite3').Database,
  lines: [string, number][],
  stockIdForLine: (lineId: string) => string = (lineId) => lineId
): string[] {
  const requested = new Map<string, { qty: number; lineIds: string[] }>();
  for (const [lineId, qty] of lines) {
    const stockId = stockIdForLine(lineId);
    const entry = requested.get(stockId) ?? { qty: 0, lineIds: [] };
    entry.qty += qty;
    entry.lineIds.push(lineId);
    requested.set(stockId, entry);
  }

  const oversold: string[] = [];
  for (const [stockId, request] of requested) {
    const row = db.prepare('SELECT remaining_qty FROM stock WHERE item_id = ?').get(stockId) as { remaining_qty: number } | undefined;
    if (!row) continue; // no stock limit for this item
    if (row.remaining_qty < request.qty) {
      oversold.push(...request.lineIds);
    }
  }
  if (oversold.length > 0) return oversold;

  for (const [stockId, request] of requested) {
    db.prepare('UPDATE stock SET remaining_qty = remaining_qty - ? WHERE item_id = ?').run(request.qty, stockId);
  }
  return [];
}
