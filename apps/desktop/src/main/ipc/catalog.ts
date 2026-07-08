import { ipcMain, dialog, app } from 'electron';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { Menu } from '@sagra/shared/types';
import { getCatalog, saveCatalog, resetCatalog, getResolvedStations, saveStationOverrides } from '../catalog/catalog.js';
import { getStations, saveStations, getCopertoStation, saveCopertoStation } from '../printing/station-map.js';

export function registerCatalogHandlers(): void {
  ipcMain.handle('catalog:get', () => {
    return {
      catalog: getCatalog(),
      stations: getResolvedStations(),
      stationList: getStations(),
      copertoStation: getCopertoStation()
    };
  });

  ipcMain.handle('catalog:save', (
    _e,
    catalog: Menu,
    stations: Record<string, string>,
    stationList: string[],
    copertoStation: string
  ) => {
    saveCatalog(catalog);
    if (Array.isArray(stationList)) saveStations(stationList);
    if (typeof copertoStation === 'string' && copertoStation) saveCopertoStation(copertoStation);
    saveStationOverrides(stations);
    return { ok: true };
  });

  ipcMain.handle('catalog:reset', () => {
    resetCatalog();
    return {
      ok: true,
      catalog: getCatalog(),
      stations: getResolvedStations(),
      stationList: getStations(),
      copertoStation: getCopertoStation()
    };
  });

  ipcMain.handle('catalog:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Esporta menu.json',
      defaultPath: join(app.getPath('downloads'), 'menu.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    const catalog = getCatalog();
    writeFileSync(result.filePath, JSON.stringify(catalog, null, 2), 'utf8');
    return { ok: true, filePath: result.filePath };
  });
}
