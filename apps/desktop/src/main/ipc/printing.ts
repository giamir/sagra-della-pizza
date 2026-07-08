import { ipcMain } from 'electron';
import { getDb } from '../db/schema.js';
import { loadPrinterConfig, savePrinterConfig, sendToTcpPrinter, sendToUsbPrinter, listUsbPrinters } from '../printing/service.js';
import { buildStationTicket, buildReceipt, buildPreviewText, groupByStation, type PrintOrder } from '../printing/templates.js';
import { getStations, getCopertoStation } from '../printing/station-map.js';
import { buildLogoBuf } from '../printing/logo.js';
import { getCatalog } from '../catalog/catalog.js';
import type { PrinterConfig, UsbPrinterEntry } from '../printing/service.js';

// Live cover charge (cents) from the editable catalog, single-sourced from the menu.
function copertoCents(): number {
  return Math.round((getCatalog().coperto?.perPersona ?? 0) * 100);
}

function loadOrderForPrint(orderId: number | bigint): PrintOrder | null {
  const db = getDb();
  const order = db
    .prepare('SELECT id, created_at, people, total_cents FROM orders WHERE id = ?')
    .get(orderId) as { id: number; created_at: string; people: number; total_cents: number } | undefined;
  if (!order) return null;

  const lines = db
    .prepare('SELECT item_id, name_snapshot, qty, unit_price_cents, station FROM order_lines WHERE order_id = ?')
    .all(orderId) as { item_id: string; name_snapshot: string; qty: number; unit_price_cents: number; station: string }[];

  return {
    id: order.id,
    createdAt: order.created_at,
    people: order.people,
    totalCents: order.total_cents,
    lines: lines.map((l) => ({
      itemId: l.item_id,
      name: l.name_snapshot || l.item_id,
      qty: l.qty,
      unitPriceCents: l.unit_price_cents,
      station: l.station
    }))
  };
}

async function doPrint(order: PrintOrder, config: PrinterConfig): Promise<void> {
  const { width } = config;
  const stationOrder = getStations();
  const copertoStation = getCopertoStation();
  const enabledStations = new Set(config.stations.filter((s) => s.enabled).map((s) => s.name));
  const byStation = groupByStation(order.lines, stationOrder);

  // 8 dots/mm × paper width: 80mm → 576 dots, 58mm → 384 dots.
  // Print the logo at ~45% of paper width (it's centered) so it isn't oversized.
  const paperDots = width >= 42 ? 576 : 384;
  const logoBuf = await buildLogoBuf(Math.round(paperDots * 0.45));

  function withLogo(ticket: Buffer): Buffer {
    return logoBuf ? Buffer.concat([logoBuf, ticket]) : ticket;
  }

  async function send(data: Buffer): Promise<void> {
    if (config.connectionType === 'usb') {
      await sendToUsbPrinter(config.usbTarget, data, config);
    } else {
      await sendToTcpPrinter(config.host, config.port, data, config.tcpTimeoutMs, config.tcpCloseDelayMs);
    }
  }

  // One ticket per station that has items and is enabled (no logo on kitchen tickets)
  for (const [station, lines] of byStation) {
    if (!enabledStations.has(station)) continue;
    const ticket = buildStationTicket(order, station, lines, width, copertoStation, config.euroMode);
    await send(ticket);
  }

  // Courtesy receipt last — logo only here
  const receipt = buildReceipt(order, width, copertoCents(), config.euroMode);
  await send(withLogo(receipt));
}

async function printPrintOrder(order: PrintOrder): Promise<{ ok: boolean; error?: string; preview?: ReturnType<typeof buildPreviewText> }> {
  const config = loadPrinterConfig();
  const preview = buildPreviewText(order, { order: getStations(), copertoStation: getCopertoStation(), copertoCents: copertoCents() });

  if (!config.enabled) {
    return { ok: false, error: 'Stampante non configurata', preview };
  }

  try {
    await doPrint(order, config);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Errore stampa', preview };
  }
}

export function registerPrintingHandlers(): void {
  // Reprint by id — reads the LOCAL db, so it is only correct on the till that
  // owns the order (the host). Used by Reports for reprints.
  ipcMain.handle('print:order', async (_event, orderId: number) => {
    const order = loadOrderForPrint(orderId);
    if (!order) return { ok: false, error: `Ordine #${orderId} non trovato` };
    return printPrintOrder(order);
  });

  // Print a fully-built order object. This is what the cassa uses right after
  // submitting: a CLIENT till's order lives only in the host db, so it prints
  // the order the host returned instead of re-loading a stale id from its own db.
  ipcMain.handle('print:orderData', async (_event, order: PrintOrder) => {
    if (!order || !Array.isArray(order.lines)) {
      return { ok: false, error: 'Dati ordine non validi' };
    }
    return printPrintOrder(order);
  });

  ipcMain.handle('print:test', async () => {
    const config = loadPrinterConfig();
    if (!config.enabled) return { ok: false, error: 'Stampante non abilitata nelle impostazioni' };

    const order: PrintOrder = {
      id: 0,
      createdAt: new Date().toISOString(),
      people: 2,
      totalCents: 1750,
      lines: [
        { itemId: 'margherita', name: 'Margherita', qty: 1, unitPriceCents: 550, station: 'Pizza' },
        { itemId: 'acqua-naturale', name: 'Acqua Naturale Piccola', qty: 2, unitPriceCents: 100, station: 'Bevande' }
      ]
    };

    try {
      await doPrint(order, config);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore stampa test' };
    }
  });

  ipcMain.handle('printer:config:get', () => loadPrinterConfig());

  ipcMain.handle('printer:config:save', (_event, config: PrinterConfig) => {
    savePrinterConfig(config);
    return { ok: true };
  });

  ipcMain.handle('printer:list', async () => {
    const printers: UsbPrinterEntry[] = await listUsbPrinters();
    return { printers };
  });
}
