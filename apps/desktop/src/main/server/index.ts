import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getDb, getSetting } from '../db/schema.js';
import { getStock, setStock, resetStock, decrementStock } from '../db/stock.js';
import { queryOrders, voidOrder } from '../db/reports.js';
import { getCatalog, getLivePriceIndex, resolveStation, resolveStockItemId } from '../catalog/catalog.js';

let _httpServer: ReturnType<typeof createServer> | null = null;
let _wss: WebSocketServer | null = null;

export function broadcastStock(): void {
  const stock = getStock();
  // Push to LAN clients over WebSocket
  if (_wss) {
    const msg = JSON.stringify({ type: 'stock', stock });
    for (const client of _wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }
  // Push to local renderer windows
  const { BrowserWindow } = require('electron') as typeof import('electron');
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('stock:update', stock);
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
  app.options('*', (_req, res) => { res.sendStatus(204); });

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
        for (const [itemId, qty] of lines) {
          const entry = priceIndex[itemId];
          insertLine.run({
            orderId,
            itemId,
            qty,
            unitPriceCents: entry ? Math.round(entry.price * 100) : 0,
            nameSnapshot: entry?.name ?? itemId,
            station: resolveStation(itemId)
          });
        }

        return orderId;
      })();

      broadcastStock();
      res.json({ ok: true, orderId: String(result) });
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
    // Send current stock immediately on connect
    ws.send(JSON.stringify({ type: 'stock', stock: getStock() }));
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
