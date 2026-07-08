import { ipcMain, dialog, app } from 'electron';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { Menu } from '@sagra/shared/types';
import { getCatalog, saveCatalog, resetCatalog, getResolvedStations, saveStationOverrides } from '../catalog/catalog.js';
import { getStations, saveStations, getCopertoStation, saveCopertoStation } from '../printing/station-map.js';
import { broadcastCatalog } from '../server/index.js';
import { loadTillSettings } from './settings.js';

type CatalogPayload = {
  catalog: Menu;
  stations: Record<string, string>;
  stationList: string[];
  copertoStation: string;
};

// The catalog is owned by the host till. A client reads it from and writes it
// back to the host over HTTP, so every till shares identical item ids — the
// host resolves receipts, station routing and stock from this one catalog.
function localPayload(): CatalogPayload {
  return {
    catalog: getCatalog(),
    stations: getResolvedStations(),
    stationList: getStations(),
    copertoStation: getCopertoStation()
  };
}

export function registerCatalogHandlers(): void {
  ipcMain.handle('catalog:get', async () => {
    const settings = loadTillSettings();
    if (settings.role === 'client') {
      try {
        const res = await fetch(`${settings.hostUrl}/catalog`, { headers: { 'cache-control': 'no-cache' } });
        return (await res.json()) as CatalogPayload;
      } catch {
        // Host unreachable — fall back to this machine's last-known catalog so
        // the Cassa can still operate offline.
        return localPayload();
      }
    }
    return localPayload();
  });

  ipcMain.handle('catalog:save', async (
    _e,
    catalog: Menu,
    stations: Record<string, string>,
    stationList: string[],
    copertoStation: string
  ) => {
    const settings = loadTillSettings();
    if (settings.role === 'client') {
      const res = await fetch(`${settings.hostUrl}/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog, stations, stationList, copertoStation })
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) return { ok: false, error: body.error ?? 'Errore salvataggio' };
      return { ok: true };
    }
    saveCatalog(catalog);
    if (Array.isArray(stationList)) saveStations(stationList);
    if (typeof copertoStation === 'string' && copertoStation) saveCopertoStation(copertoStation);
    saveStationOverrides(stations);
    broadcastCatalog();
    return { ok: true };
  });

  ipcMain.handle('catalog:reset', async () => {
    const settings = loadTillSettings();
    if (settings.role === 'client') {
      const res = await fetch(`${settings.hostUrl}/catalog/reset`, { method: 'POST' });
      return (await res.json()) as { ok: boolean } & CatalogPayload;
    }
    resetCatalog();
    broadcastCatalog();
    return { ok: true, ...localPayload() };
  });

  ipcMain.handle('catalog:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Esporta menu.json',
      defaultPath: join(app.getPath('downloads'), 'menu.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    // Export the catalog actually in use (the host's, for a client till).
    const settings = loadTillSettings();
    let catalog: Menu = getCatalog();
    if (settings.role === 'client') {
      try {
        const res = await fetch(`${settings.hostUrl}/catalog`);
        catalog = ((await res.json()) as CatalogPayload).catalog;
      } catch {
        /* fall back to local */
      }
    }
    writeFileSync(result.filePath, JSON.stringify(catalog, null, 2), 'utf8');
    return { ok: true, filePath: result.filePath };
  });
}
