import { ipcMain } from 'electron';
import { queryOrders, voidOrder, type ReportOrder } from '../db/reports.js';
import { broadcastStock } from '../server/index.js';
import { loadTillSettings } from './settings.js';

export function registerReportsHandlers(): void {
  ipcMain.handle('reports:get', async (_event, from: string, to: string) => {
    const settings = loadTillSettings();
    try {
      if (settings.role === 'client') {
        const url = `${settings.hostUrl}/orders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        const res = await fetch(url);
        const data = (await res.json()) as { orders: ReportOrder[] };
        return { ok: true, orders: data.orders };
      }
      return { ok: true, orders: queryOrders(from, to) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore', orders: [] };
    }
  });

  ipcMain.handle('order:void', async (_event, orderId: string) => {
    const settings = loadTillSettings();
    try {
      if (settings.role === 'client') {
        const res = await fetch(`${settings.hostUrl}/orders/${encodeURIComponent(orderId)}/void`, { method: 'POST' });
        const data = (await res.json()) as { ok: boolean; order?: ReportOrder; error?: string };
        return data;
      }
      const order = voidOrder(Number(orderId));
      if (!order) return { ok: false, error: 'Ordine non trovato' };
      broadcastStock();
      return { ok: true, order };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore' };
    }
  });
}
