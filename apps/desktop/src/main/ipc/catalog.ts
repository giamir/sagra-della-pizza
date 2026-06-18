import { ipcMain, dialog, app } from 'electron';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { Menu } from '@sagra/shared/types';
import { getCatalog, saveCatalog, getStationOverrides, saveStationOverrides } from '../catalog/catalog.js';

export function registerCatalogHandlers(): void {
  ipcMain.handle('catalog:get', () => {
    return { catalog: getCatalog(), stations: getStationOverrides() };
  });

  ipcMain.handle('catalog:save', (_e, catalog: Menu, stations: Record<string, string>) => {
    saveCatalog(catalog);
    saveStationOverrides(stations);
    return { ok: true };
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
