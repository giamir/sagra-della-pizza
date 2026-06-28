import { ipcMain, dialog, app } from 'electron';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildBundle, importBundle, resetDatabase } from '../db/backup.js';
import { snapshotDb, pruneSnapshots } from '../db/auto-backup.js';
import { broadcastStock } from '../server/index.js';

function defaultBackupName(): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `gestionale-backup-${date}.json`;
}

export function registerBackupHandlers(): void {
  ipcMain.handle('database:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Esporta database',
      defaultPath: join(app.getPath('downloads'), defaultBackupName()),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    try {
      writeFileSync(result.filePath, JSON.stringify(buildBundle(), null, 2), 'utf8');
      return { ok: true, filePath: result.filePath };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('database:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Importa database',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false, cancelled: true };
    try {
      const raw = readFileSync(result.filePaths[0], 'utf8');
      const bundle = JSON.parse(raw);
      const { orders } = importBundle(bundle);
      broadcastStock();
      return { ok: true, orders };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('database:reset', async () => {
    try {
      // Always take a raw snapshot first — the wipe is irreversible, so this is
      // the only way back if it was triggered by mistake.
      snapshotDb('pre-reset');
      pruneSnapshots();
      const { orders } = resetDatabase();
      broadcastStock();
      return { ok: true, orders };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
