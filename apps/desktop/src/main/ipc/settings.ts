import { ipcMain, BrowserWindow } from 'electron';
import WebSocket from 'ws';
import { getSetting, setSetting } from '../db/schema.js';
import { startServer, stopServer } from '../server/index.js';

let _wsClient: WebSocket | null = null;

function startWsClient(hostUrl: string): void {
  if (_wsClient) { _wsClient.close(); _wsClient = null; }
  const wsUrl = hostUrl.replace(/^https?/, 'ws');
  const ws = new WebSocket(wsUrl);
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; stock: Record<string, number> };
      if (msg.type === 'stock') {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('stock:update', msg.stock);
        }
      }
    } catch { /* ignore malformed messages */ }
  });
  ws.on('error', () => { /* silent — retry on next settings save */ });
  ws.on('close', () => { if (_wsClient === ws) _wsClient = null; });
  _wsClient = ws;
}

function stopWsClient(): void {
  _wsClient?.close();
  _wsClient = null;
}

export type TillSettings = {
  tillName: string;
  role: 'host' | 'client';
  hostUrl: string; // used when role = 'client', e.g. http://192.168.1.10:7331
  serverPort: number;
};

const DEFAULTS: TillSettings = {
  tillName: 'Cassa 1',
  role: 'host',
  hostUrl: 'http://192.168.1.10:7331',
  serverPort: 7331
};

export function loadTillSettings(): TillSettings {
  const raw = getSetting('till_settings');
  if (!raw) return { ...DEFAULTS };
  try { return { ...DEFAULTS, ...JSON.parse(raw) }; }
  catch { return { ...DEFAULTS }; }
}

export function saveTillSettings(s: TillSettings): void {
  setSetting('till_settings', JSON.stringify(s));
}

export function applyServerRole(settings: TillSettings): void {
  if (settings.role === 'host') {
    stopWsClient();
    startServer(settings.serverPort);
  } else {
    stopServer();
    startWsClient(settings.hostUrl);
  }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => loadTillSettings());

  ipcMain.handle('settings:save', (_event, s: TillSettings) => {
    saveTillSettings(s);
    applyServerRole(s);
    return { ok: true };
  });
}
