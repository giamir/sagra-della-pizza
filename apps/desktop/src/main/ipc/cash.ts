import { ipcMain } from 'electron';
import {
  getCashFloats,
  setCashFloat,
  closeCashDay,
  reopenCashDay,
  getCashHistory,
  type CashFloat,
  type CashHistoryRow
} from '../db/cash.js';
import { loadTillSettings } from './settings.js';

export function registerCashHandlers(): void {
  ipcMain.handle('cash:get', async (_event, date: string) => {
    const settings = loadTillSettings();
    try {
      if (settings.role === 'client') {
        const url = `${settings.hostUrl}/cash-floats?date=${encodeURIComponent(date)}`;
        const res = await fetch(url);
        const data = (await res.json()) as { floats: CashFloat[] };
        return { ok: true, floats: data.floats };
      }
      return { ok: true, floats: getCashFloats(date) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore', floats: [] };
    }
  });

  ipcMain.handle(
    'cash:set',
    async (_event, tillName: string, date: string, fondoCents: number, countedCents: number | null) => {
      const settings = loadTillSettings();
      try {
        if (settings.role === 'client') {
          const res = await fetch(`${settings.hostUrl}/cash-floats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tillName, date, fondoCents, countedCents })
          });
          return (await res.json()) as { ok: boolean; error?: string };
        }
        setCashFloat(tillName, date, fondoCents, countedCents);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Errore' };
      }
    }
  );

  ipcMain.handle('cash:history', async () => {
    const settings = loadTillSettings();
    try {
      if (settings.role === 'client') {
        const res = await fetch(`${settings.hostUrl}/cash-history`);
        const data = (await res.json()) as { history: CashHistoryRow[] };
        return { ok: true, history: data.history };
      }
      return { ok: true, history: getCashHistory() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore', history: [] };
    }
  });

  ipcMain.handle(
    'cash:close',
    async (_event, tillName: string, date: string, takingsCashCents: number) => {
      const settings = loadTillSettings();
      try {
        if (settings.role === 'client') {
          const res = await fetch(`${settings.hostUrl}/cash-close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tillName, date, takingsCashCents })
          });
          return (await res.json()) as { ok: boolean; error?: string };
        }
        closeCashDay(tillName, date, takingsCashCents);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Errore' };
      }
    }
  );

  ipcMain.handle('cash:reopen', async (_event, tillName: string, date: string) => {
    const settings = loadTillSettings();
    try {
      if (settings.role === 'client') {
        const res = await fetch(`${settings.hostUrl}/cash-reopen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tillName, date })
        });
        return (await res.json()) as { ok: boolean; error?: string };
      }
      reopenCashDay(tillName, date);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore' };
    }
  });
}
