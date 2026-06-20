import { ipcMain } from 'electron';
import { getDb } from '../db/schema.js';
import { decrementStock } from '../db/stock.js';
import { loadTillSettings } from './settings.js';
import { broadcastStock } from '../server/index.js';
import { clearReservation } from '../server/reservations.js';
import { getLivePriceIndex, resolveStation, resolveStockItemId } from '../catalog/catalog.js';

type SubmitOrderPayload = {
  people: number;
  totalCents: number;
  lines: [string, number][];
  source?: 'qr' | 'manual';
  paymentMethod?: 'cash' | 'card';
};

async function submitToHost(hostUrl: string, tillName: string, payload: SubmitOrderPayload): Promise<{ ok: boolean; orderId?: string; error?: string; oversold?: string[] }> {
  const res = await fetch(`${hostUrl}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, tillName })
  });
  return res.json() as Promise<{ ok: boolean; orderId?: string; error?: string; oversold?: string[] }>;
}

function submitLocal(payload: SubmitOrderPayload, tillName: string): { ok: boolean; orderId: bigint | number; error?: string; oversold?: string[] } {
  const db = getDb();

  const insertOrder = db.prepare(`
    INSERT INTO orders (till_name, people, total_cents, status, source, payment_method)
    VALUES (@tillName, @people, @totalCents, 'paid', @source, @paymentMethod)
  `);
  const insertLine = db.prepare(`
    INSERT INTO order_lines (order_id, item_id, qty, unit_price_cents, name_snapshot, station)
    VALUES (@orderId, @itemId, @qty, @unitPriceCents, @nameSnapshot, @station)
  `);

  const result = db.transaction(() => {
    const oversold = decrementStock(db, payload.lines, resolveStockItemId);
    if (oversold.length > 0) throw Object.assign(new Error('Esaurito'), { oversold });

    const row = insertOrder.run({ tillName, people: payload.people, totalCents: payload.totalCents, source: payload.source ?? 'manual', paymentMethod: payload.paymentMethod ?? 'cash' });
    const orderId = row.lastInsertRowid;
    const priceIndex = getLivePriceIndex();

    for (const [itemId, qty] of payload.lines) {
      const entry = priceIndex[itemId];
      insertLine.run({
        orderId, itemId, qty,
        unitPriceCents: entry ? Math.round(entry.price * 100) : 0,
        nameSnapshot: entry?.name ?? itemId,
        station: resolveStation(itemId)
      });
    }

    return orderId;
  })();

  // Sold now, so release this till's hold — avoids double-subtracting.
  clearReservation(tillName);
  broadcastStock();
  return { ok: true, orderId: result };
}

export function registerOrderHandlers(): void {
  ipcMain.handle('order:submit', async (_event, payload: SubmitOrderPayload) => {
    const settings = loadTillSettings();

    try {
      if (settings.role === 'client') {
        const result = await submitToHost(settings.hostUrl, settings.tillName, payload);
        if (!result.ok) return { ok: false, error: result.error, oversold: result.oversold };
        return { ok: true, orderId: result.orderId };
      } else {
        return submitLocal(payload, settings.tillName);
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'oversold' in err) {
        return { ok: false, error: err.message, oversold: (err as any).oversold };
      }
      return { ok: false, error: err instanceof Error ? err.message : 'Errore' };
    }
  });
}
