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
export function decrementStock(db: import('better-sqlite3').Database, lines: [string, number][]): string[] {
  const oversold: string[] = [];
  for (const [itemId, qty] of lines) {
    const row = db.prepare('SELECT remaining_qty FROM stock WHERE item_id = ?').get(itemId) as { remaining_qty: number } | undefined;
    if (!row) continue; // no stock limit for this item
    if (row.remaining_qty < qty) {
      oversold.push(itemId);
    }
  }
  if (oversold.length > 0) return oversold;

  for (const [itemId, qty] of lines) {
    db.prepare('UPDATE stock SET remaining_qty = remaining_qty - ? WHERE item_id = ?').run(qty, itemId);
  }
  return [];
}
