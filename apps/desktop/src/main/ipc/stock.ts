import { ipcMain, BrowserWindow } from 'electron';
import { getStock, setStock, resetStock } from '../db/stock.js';
import { broadcastStock } from '../server/index.js';
import { getReservedTotals, setReservation } from '../server/reservations.js';
import { loadTillSettings } from './settings.js';

async function remoteSetStock(hostUrl: string, itemId: string, qty: number): Promise<void> {
  const res = await fetch(`${hostUrl}/stock/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qty })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function remoteResetStock(hostUrl: string, itemId: string): Promise<void> {
  const res = await fetch(`${hostUrl}/stock/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function remoteSetReservation(hostUrl: string, tillName: string, lines: [string, number][]): Promise<void> {
  const res = await fetch(`${hostUrl}/reservations/${encodeURIComponent(tillName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function registerStockHandlers(): void {
  ipcMain.handle('stock:get', async () => {
    const settings = loadTillSettings();
    if (settings.role === 'client') {
      try {
        const res = await fetch(`${settings.hostUrl}/stock`);
        const data = (await res.json()) as { stock: Record<string, number> };
        return data.stock;
      } catch {
        return getStock(); // fallback to local snapshot
      }
    }
    return getStock();
  });

  ipcMain.handle('stock:set', async (_event, itemId: string, qty: number) => {
    const settings = loadTillSettings();
    try {
      if (settings.role === 'client') {
        await remoteSetStock(settings.hostUrl, itemId, qty);
      } else {
        setStock(itemId, qty);
        broadcastStock();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore' };
    }
  });

  ipcMain.handle('stock:reset', async (_event, itemId: string) => {
    const settings = loadTillSettings();
    try {
      if (settings.role === 'client') {
        await remoteResetStock(settings.hostUrl, itemId);
      } else {
        resetStock(itemId);
        broadcastStock();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore' };
    }
  });

  // Current reserved totals (used on renderer mount before the first broadcast).
  ipcMain.handle('reservations:get', async () => {
    const settings = loadTillSettings();
    if (settings.role === 'client') {
      try {
        const res = await fetch(`${settings.hostUrl}/reservations`);
        const data = (await res.json()) as { reserved: Record<string, number> };
        return data.reserved;
      } catch {
        return {};
      }
    }
    return getReservedTotals();
  });

  // This till publishes its current cart as a soft hold. Best-effort: a failed
  // network push just means the hold isn't reflected elsewhere yet.
  ipcMain.handle('reservations:set', async (_event, lines: [string, number][]) => {
    const settings = loadTillSettings();
    try {
      if (settings.role === 'client') {
        await remoteSetReservation(settings.hostUrl, settings.tillName, lines);
      } else {
        setReservation(settings.tillName, lines);
        broadcastStock();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore' };
    }
  });
}

export function pushStockToRenderer(): void {
  const payload = { stock: getStock(), reserved: getReservedTotals() };
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('stock:update', payload);
  }
}
