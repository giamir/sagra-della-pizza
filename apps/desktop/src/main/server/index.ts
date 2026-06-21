import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getDb, getSetting } from '../db/schema.js';
import { getStock, setStock, resetStock, decrementStock } from '../db/stock.js';
import { queryOrders, voidOrder } from '../db/reports.js';
import { getCatalog, getLivePriceIndex, resolveStation, resolveStockItemId } from '../catalog/catalog.js';
import { getReservedTotals, setReservation, clearReservation } from './reservations.js';

let _httpServer: ReturnType<typeof createServer> | null = null;
let _wss: WebSocketServer | null = null;

// The payload every till consumes to render live "rimasti": the persisted
// remaining (raw) plus the soft-holds currently in carts. Effective remaining
// is computed client-side as stock − reserved so the admin can still see raw.
function stockPayload(): { stock: Record<string, number>; reserved: Record<string, number> } {
  return { stock: getStock(), reserved: getReservedTotals() };
}

export function broadcastStock(): void {
  const payload = stockPayload();
  // Push to LAN clients over WebSocket
  if (_wss) {
    const msg = JSON.stringify({ type: 'stock', ...payload });
    for (const client of _wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }
  // Push to local renderer windows
  const { BrowserWindow } = require('electron') as typeof import('electron');
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('stock:update', payload);
  }
}

export function broadcastIncomingOrder(payload: { v?: number; p: number; l: [string, number][]; t: number }): void {
  // Push the scanned order to the host till's renderer so the cashier can
  // review it and take payment — it is NOT persisted here.
  const { BrowserWindow } = require('electron') as typeof import('electron');
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('order:incoming', payload);
  }
}

export function startServer(port = 7331): void {
  if (_httpServer) return;

  const app = express();
  app.use(express.json());

  // Allow cross-origin requests from the web app (phones on the same LAN).
  // The Private-Network header lets Chrome/Safari call an HTTP local IP from an HTTPS page.
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
  });
  app.options(/.*/, (_req, res) => { res.sendStatus(204); });

  // --- Health ---
  app.get('/ping', (_req, res) => res.json({ ok: true, role: 'host' }));

  // --- Catalog ---
  app.get('/catalog', (_req, res) => res.json({ menu: getCatalog() }));

  // --- Reports ---
  app.get('/orders', (req, res) => {
    const from = String(req.query.from ?? '1970-01-01T00:00:00Z');
    const to   = String(req.query.to   ?? '9999-12-31T23:59:59Z');
    res.json({ orders: queryOrders(from, to) });
  });

  app.post('/orders/:id/void', (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ ok: false, error: 'ID non valido' }); return; }
    const order = voidOrder(id);
    if (!order) { res.status(404).json({ ok: false, error: 'Ordine non trovato' }); return; }
    broadcastStock();
    res.json({ ok: true, order });
  });

  // --- Stock ---
  app.get('/stock', (_req, res) => res.json({ stock: getStock() }));

  app.put('/stock/:itemId', (req, res) => {
    const { itemId } = req.params;
    const { qty } = req.body as { qty: number };
    if (typeof qty !== 'number' || qty < 0) {
      res.status(400).json({ ok: false, error: 'qty non valido' });
      return;
    }
    setStock(itemId, qty);
    broadcastStock();
    res.json({ ok: true });
  });

  app.delete('/stock/:itemId', (req, res) => {
    const { itemId } = req.params;
    resetStock(itemId);
    broadcastStock();
    res.json({ ok: true });
  });

  // --- Reservations (soft cart holds) ---
  app.get('/reservations', (_req, res) => res.json({ reserved: getReservedTotals() }));

  // A client till publishes its current cart so its items count against the
  // live "rimasti" everyone sees. An empty cart clears that till's hold.
  app.put('/reservations/:tillName', (req, res) => {
    const { tillName } = req.params;
    const { lines } = req.body as { lines?: [string, number][] };
    if (!Array.isArray(lines)) {
      res.status(400).json({ ok: false, error: 'lines non valido' });
      return;
    }
    setReservation(tillName, lines);
    broadcastStock();
    res.json({ ok: true });
  });

  // --- Pending order from the phone QR scanner ---
  // Does NOT persist. Loads the order into the host till's cart so the cashier
  // can verify it and take payment (same flow as scanning with the till camera).
  app.post('/pending-order', (req, res) => {
    const { payload } = req.body as {
      payload?: { v?: number; p?: number; l?: [string, number][]; t?: number };
    };

    if (!payload || typeof payload.p !== 'number' || !Array.isArray(payload.l) || typeof payload.t !== 'number') {
      res.status(400).json({ ok: false, error: 'Payload non valido' });
      return;
    }

    broadcastIncomingOrder(payload as { v?: number; p: number; l: [string, number][]; t: number });
    res.json({ ok: true });
  });

  // --- Submit order (used by client tills) ---
  app.post('/orders', (req, res) => {
    const { people, totalCents, lines, source, tillName, paymentMethod } = req.body as {
      people: number;
      totalCents: number;
      lines: [string, number][];
      source?: string;
      tillName?: string;
      paymentMethod?: string;
    };

    if (!Array.isArray(lines) || typeof people !== 'number') {
      res.status(400).json({ ok: false, error: 'Payload non valido' });
      return;
    }

    const db = getDb();

    const insertOrder = db.prepare(`
      INSERT INTO orders (till_name, people, total_cents, status, source, payment_method)
      VALUES (@tillName, @people, @totalCents, 'paid', @source, @paymentMethod)
    `);
    const insertLine = db.prepare(`
      INSERT INTO order_lines (order_id, item_id, qty, unit_price_cents, name_snapshot, station)
      VALUES (@orderId, @itemId, @qty, @unitPriceCents, @nameSnapshot, @station)
    `);

    try {
      const result = db.transaction(() => {
        const oversold = decrementStock(db, lines, resolveStockItemId);
        if (oversold.length > 0) {
          throw Object.assign(new Error('Esaurito'), { oversold });
        }

        const row = insertOrder.run({
          tillName: tillName ?? getSetting('till_name') ?? 'default',
          people,
          totalCents,
          source: source ?? 'manual',
          paymentMethod: paymentMethod ?? 'cash'
        });
        const orderId = row.lastInsertRowid;

        const priceIndex = getLivePriceIndex();
        const printLines = [] as { itemId: string; qty: number; unitPriceCents: number; name: string; station: string }[];
        for (const [itemId, qty] of lines) {
          const entry = priceIndex[itemId];
          const unitPriceCents = entry ? Math.round(entry.price * 100) : 0;
          const nameSnapshot = entry?.name ?? itemId;
          const station = resolveStation(itemId);
          insertLine.run({ orderId, itemId, qty, unitPriceCents, nameSnapshot, station });
          printLines.push({ itemId, qty, unitPriceCents, name: nameSnapshot, station });
        }

        return { orderId, printLines };
      })();

      // Items just moved from held-in-cart to sold: drop this till's hold so it
      // isn't subtracted twice. Real stock was already decremented above.
      clearReservation(tillName ?? getSetting('till_name') ?? 'default');
      broadcastStock();
      // Return the fully-built order so the submitting client can print it
      // locally — the client cannot re-load this id from its own db.
      const order = {
        id: Number(result.orderId),
        createdAt: new Date().toISOString(),
        people,
        totalCents,
        lines: result.printLines
      };
      res.json({ ok: true, orderId: String(result.orderId), order });
    } catch (err: unknown) {
      if (err instanceof Error && 'oversold' in err) {
        res.status(409).json({ ok: false, error: err.message, oversold: (err as any).oversold });
      } else {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Errore' });
      }
    }
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    // Send current stock + reservations immediately on connect
    ws.send(JSON.stringify({ type: 'stock', ...stockPayload() }));
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[server] Listening on :${port}`);
  });

  _httpServer = httpServer;
  _wss = wss;
}

export function stopServer(): void {
  _wss?.close();
  _httpServer?.close();
  _wss = null;
  _httpServer = null;
}
