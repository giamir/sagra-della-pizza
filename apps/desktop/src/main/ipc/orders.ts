import { ipcMain } from 'electron';
import { getDb } from '../db/schema.js';
import { decrementStock } from '../db/stock.js';
import { loadTillSettings } from './settings.js';
import { broadcastStock } from '../server/index.js';
import { clearReservation } from '../server/reservations.js';
import { getLivePriceIndex, resolveStation, resolveStockItemId } from '../catalog/catalog.js';
import { isAdjKey, parseAdj, adjLabel } from '@sagra/shared/utils/adjustments';

type SubmitOrderPayload = {
  people: number;
  totalCents: number;
  lines: [string, number][];
  source?: 'qr' | 'manual';
  paymentMethod?: 'cash' | 'card';
};

type PrintOrderPayload = {
  id: number | bigint;
  createdAt: string;
  people: number;
  totalCents: number;
  lines: { itemId: string; qty: number; unitPriceCents: number; name: string; station: string }[];
};

async function submitToHost(hostUrl: string, tillName: string, payload: SubmitOrderPayload): Promise<{ ok: boolean; orderId?: string; order?: PrintOrderPayload; error?: string; oversold?: string[] }> {
  const res = await fetch(`${hostUrl}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, tillName })
  });
  return res.json() as Promise<{ ok: boolean; orderId?: string; order?: PrintOrderPayload; error?: string; oversold?: string[] }>;
}

function submitLocal(payload: SubmitOrderPayload, tillName: string): { ok: boolean; orderId: bigint | number; order?: PrintOrderPayload; error?: string; oversold?: string[] } {
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
    const printLines: PrintOrderPayload['lines'] = [];

    for (const [itemId, qty] of payload.lines) {
      if (isAdjKey(itemId)) {
        const { cents, reason } = parseAdj(itemId);
        const name = reason || adjLabel(cents);
        insertLine.run({ orderId, itemId, qty: 1, unitPriceCents: cents, nameSnapshot: name, station: '' });
        printLines.push({ itemId, qty: 1, unitPriceCents: cents, name, station: '' });
        continue;
      }
      const entry = priceIndex[itemId];
      const unitPriceCents = entry ? Math.round(entry.price * 100) : 0;
      const nameSnapshot = entry?.name ?? itemId;
      const station = resolveStation(itemId);
      insertLine.run({ orderId, itemId, qty, unitPriceCents, nameSnapshot, station });
      printLines.push({ itemId, qty, unitPriceCents, name: nameSnapshot, station });
    }

    return { orderId, printLines };
  })();

  // Sold now, so release this till's hold — avoids double-subtracting.
  clearReservation(tillName);
  broadcastStock();
  const order: PrintOrderPayload = {
    id: Number(result.orderId),
    createdAt: new Date().toISOString(),
    people: payload.people,
    totalCents: payload.totalCents,
    lines: result.printLines
  };
  return { ok: true, orderId: result.orderId, order };
}

export function registerOrderHandlers(): void {
  ipcMain.handle('order:submit', async (_event, payload: SubmitOrderPayload) => {
    const settings = loadTillSettings();

    try {
      if (settings.role === 'client') {
        const result = await submitToHost(settings.hostUrl, settings.tillName, payload);
        if (!result.ok) return { ok: false, error: result.error, oversold: result.oversold };
        return { ok: true, orderId: result.orderId, order: result.order };
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
