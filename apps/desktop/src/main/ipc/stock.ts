import { ipcMain, BrowserWindow } from 'electron';
import { getStock, setStock, resetStock } from '../db/stock.js';
import { broadcastStock } from '../server/index.js';
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
}

export function pushStockToRenderer(): void {
  const stock = getStock();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('stock:update', stock);
  }
}
