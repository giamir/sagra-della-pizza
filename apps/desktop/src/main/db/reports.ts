import { getDb } from './schema.js';

export type ReportLine = {
  itemId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  station: string;
};

export type ReportOrder = {
  id: string;
  tillName: string;
  createdAt: string;
  people: number;
  totalCents: number;
  source: 'qr' | 'manual';
  paymentMethod: 'cash' | 'card';
  lines: ReportLine[];
};

type OrderRow = {
  id: number;
  till_name: string;
  created_at: string;
  people: number;
  total_cents: number;
  source: string;
  payment_method: string;
  item_id: string | null;
  name_snapshot: string | null;
  qty: number | null;
  unit_price_cents: number | null;
  station: string | null;
};

export function getOrder(id: number): ReportOrder | null {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      o.id, o.till_name, o.created_at, o.people, o.total_cents, o.source, o.payment_method,
      l.item_id, l.name_snapshot, l.qty, l.unit_price_cents, l.station
    FROM orders o
    LEFT JOIN order_lines l ON l.order_id = o.id
    WHERE o.id = ?
    ORDER BY l.id ASC
  `).all(id) as OrderRow[];

  if (rows.length === 0) return null;
  const r0 = rows[0];
  const order: ReportOrder = {
    id: String(r0.id),
    tillName: r0.till_name,
    createdAt: r0.created_at,
    people: r0.people,
    totalCents: r0.total_cents,
    source: r0.source as 'qr' | 'manual',
    paymentMethod: (r0.payment_method ?? 'cash') as 'cash' | 'card',
    lines: []
  };
  for (const r of rows) {
    if (r.item_id != null) {
      order.lines.push({
        itemId: r.item_id,
        name: r.name_snapshot ?? r.item_id,
        qty: r.qty ?? 1,
        unitPriceCents: r.unit_price_cents ?? 0,
        station: r.station ?? ''
      });
    }
  }
  return order;
}

export function voidOrder(id: number): ReportOrder | null {
  const db = getDb();
  const order = getOrder(id);
  if (!order) return null;

  db.transaction(() => {
    db.prepare(`UPDATE orders SET status = 'voided' WHERE id = ?`).run(id);
    // Restore stock for each line (only affects rows that exist in the stock table)
    for (const line of order.lines) {
      db.prepare(`
        UPDATE stock SET remaining_qty = MIN(initial_qty, remaining_qty + ?)
        WHERE item_id = ?
      `).run(line.qty, line.itemId);
    }
  })();

  return order;
}

export function queryOrders(from: string, to: string): ReportOrder[] {
  const rows = getDb().prepare(`
    SELECT
      o.id, o.till_name, o.created_at, o.people, o.total_cents, o.source, o.payment_method,
      l.item_id, l.name_snapshot, l.qty, l.unit_price_cents, l.station
    FROM orders o
    LEFT JOIN order_lines l ON l.order_id = o.id
    WHERE o.created_at >= ? AND o.created_at <= ?
      AND o.status != 'voided'
    ORDER BY o.created_at DESC, o.id DESC, l.id ASC
  `).all(from, to) as OrderRow[];

  const map = new Map<number, ReportOrder>();
  for (const r of rows) {
    if (!map.has(r.id)) {
      map.set(r.id, {
        id: String(r.id),
        tillName: r.till_name,
        createdAt: r.created_at,
        people: r.people,
        totalCents: r.total_cents,
        source: r.source as 'qr' | 'manual',
        paymentMethod: (r.payment_method ?? 'cash') as 'cash' | 'card',
        lines: []
      });
    }
    if (r.item_id != null) {
      map.get(r.id)!.lines.push({
        itemId: r.item_id,
        name: r.name_snapshot ?? r.item_id,
        qty: r.qty ?? 1,
        unitPriceCents: r.unit_price_cents ?? 0,
        station: r.station ?? ''
      });
    }
  }

  return Array.from(map.values());
}
