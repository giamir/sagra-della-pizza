import { app, ipcMain, BrowserWindow } from 'electron';
import { networkInterfaces } from 'os';
import WebSocket from 'ws';
import { getSetting, setSetting } from '../db/schema.js';
import { startServer, stopServer } from '../server/index.js';
import { tenant } from '../config/tenant.js';

let _wsClient: WebSocket | null = null;

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Compare this client's app version against the host's (from /ping) and tell
// the renderer so it can warn the operator about a drifted fleet. Non-fatal:
// any failure just leaves the banner untouched.
async function checkHostVersion(hostUrl: string): Promise<void> {
  try {
    const res = await fetch(`${hostUrl}/ping`, { headers: { 'cache-control': 'no-cache' } });
    const data = (await res.json()) as { version?: string };
    const hostVersion = data.version;
    if (!hostVersion) return;
    const localVersion = app.getVersion();
    const payload = {
      mismatch: compareVersions(hostVersion, localVersion) !== 0,
      hostVersion,
      localVersion
    };
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('version:mismatch', payload);
    }
  } catch { /* host unreachable — leave banner as-is */ }
}

function startWsClient(hostUrl: string): void {
  if (_wsClient) { _wsClient.close(); _wsClient = null; }
  const wsUrl = hostUrl.replace(/^https?/, 'ws');
  const ws = new WebSocket(wsUrl);
  ws.on('open', () => { void checkHostVersion(hostUrl); });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as {
        type: string;
        stock: Record<string, number>;
        reserved?: Record<string, number>;
      };
      if (msg.type === 'stock') {
        const payload = { stock: msg.stock, reserved: msg.reserved ?? {} };
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('stock:update', payload);
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

export type LocalNetworkAddress = {
  name: string;
  address: string;
};

const DEFAULTS: TillSettings = {
  tillName: tenant.network.defaultTillName,
  role: 'host',
  hostUrl: `http://192.168.1.10:${tenant.network.serverPort}`,
  serverPort: tenant.network.serverPort
};

function getLocalNetworkAddresses(): LocalNetworkAddress[] {
  const addresses: LocalNetworkAddress[] = [];
  const interfaces = networkInterfaces();

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      addresses.push({ name, address: entry.address });
    }
  }

  return addresses.sort((a, b) => {
    const aWifi = /wi-?fi|wlan|en0/i.test(a.name);
    const bWifi = /wi-?fi|wlan|en0/i.test(b.name);
    if (aWifi !== bWifi) return aWifi ? -1 : 1;
    return a.name.localeCompare(b.name) || a.address.localeCompare(b.address);
  });
}

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
  ipcMain.handle('settings:network-addresses:get', () => getLocalNetworkAddresses());

  ipcMain.handle('settings:save', (_event, s: TillSettings) => {
    saveTillSettings(s);
    applyServerRole(s);
    return { ok: true };
  });
}
