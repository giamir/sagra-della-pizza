import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

const UPDATE_FEED_URL = 'https://sagradellapizza.it/desktop-updates';
const DOWNLOAD_PAGE_URL = 'https://sagradellapizza.it/download';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const supportsAutoInstall = process.platform !== 'darwin';

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  isPackaged: boolean;
  supportsAutoInstall: boolean;
  message: string;
  latestVersion?: string;
  lastCheckedAt?: string;
  percent?: number;
  error?: string;
};

let status: UpdateStatus = {
  state: 'idle',
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  supportsAutoInstall,
  message: app.isPackaged
    ? supportsAutoInstall
      ? 'Aggiornamenti automatici pronti.'
      : 'Su macOS il controllo verifica la versione disponibile. Scarica il DMG dalla pagina download.'
    : 'Aggiornamenti automatici disponibili solo nella versione installata.'
};
let checkTimer: NodeJS.Timeout | null = null;

function publish(next: Partial<UpdateStatus>): UpdateStatus {
  status = {
    ...status,
    ...next,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    supportsAutoInstall
  };

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updates:status', status);
  }

  return status;
}

function versionFrom(info?: UpdateInfo | null): string | undefined {
  return info?.version;
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error && error.message
    ? error.message
    : typeof error === 'string' && error
      ? error
      : 'Errore aggiornamento sconosciuto.';

  if (raw.includes('GitHubProvider') || raw.includes('github.com') || raw.includes('<feed')) {
    return `Il controllo aggiornamenti sta ancora usando il vecchio feed GitHub. Scarica e reinstalla l'ultima versione da ${DOWNLOAD_PAGE_URL}.`;
  }

  if (raw.includes('Code signature at URL') || raw.includes('ShipIt') || raw.includes('did not pass validation')) {
    return `macOS ha rifiutato l'installazione automatica per la firma dell'app. Scarica il DMG da ${DOWNLOAD_PAGE_URL}.`;
  }

  if (raw.includes(UPDATE_FEED_URL) || raw.includes('desktop-updates')) {
    return 'Feed aggiornamenti non raggiungibile. Verifica la connessione internet e riprova.';
  }

  const firstLine = raw.replace(/<[^>]+>/g, ' ').split('\n').map((line) => line.trim()).find(Boolean);
  if (firstLine) return firstLine.slice(0, 240);

  return 'Errore aggiornamento sconosciuto.';
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function checkMacUpdateFeed(): Promise<UpdateStatus> {
  const response = await fetch(`${UPDATE_FEED_URL}/latest-mac.yml`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' }
  });
  if (!response.ok) throw new Error(`Feed aggiornamenti non raggiungibile (${response.status}).`);

  const text = await response.text();
  const latestVersion = text.match(/^version:\s*(.+)$/m)?.[1]?.trim();
  if (!latestVersion) throw new Error('Versione non trovata nel feed aggiornamenti.');

  if (compareVersions(latestVersion, app.getVersion()) > 0) {
    return publish({
      state: 'available',
      latestVersion,
      message: `Aggiornamento ${latestVersion} disponibile. Scarica il DMG dalla pagina download.`,
      percent: undefined,
      error: undefined
    });
  }

  return publish({
    state: 'not-available',
    latestVersion,
    message: 'Stai usando la versione più recente.',
    percent: undefined,
    error: undefined
  });
}

async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return publish({
      state: 'idle',
      message: 'Aggiornamenti automatici disponibili solo nella versione installata.'
    });
  }

  if (status.state === 'checking' || status.state === 'downloading') return status;

  publish({
    state: 'checking',
    message: 'Controllo aggiornamenti…',
    lastCheckedAt: new Date().toISOString(),
    percent: undefined,
    error: undefined
  });

  try {
    if (!supportsAutoInstall) return await checkMacUpdateFeed();
    await autoUpdater.checkForUpdates();
  } catch (error) {
    publish({
      state: 'error',
      message: 'Impossibile controllare gli aggiornamenti.',
      error: errorMessage(error)
    });
  }

  return status;
}

export function registerUpdateHandlers(): void {
  ipcMain.handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged
  }));

  ipcMain.handle('updates:status:get', () => status);
  ipcMain.handle('updates:check', () => checkForUpdates());
  ipcMain.handle('updates:install', async () => {
    if (!supportsAutoInstall) {
      await shell.openExternal(DOWNLOAD_PAGE_URL);
      return { ok: true };
    }
    if (status.state !== 'downloaded') return { ok: false, error: 'Nessun aggiornamento pronto da installare.' };
    autoUpdater.quitAndInstall();
    return { ok: true };
  });
  ipcMain.handle('updates:open-releases', async () => {
    await shell.openExternal(DOWNLOAD_PAGE_URL);
    return { ok: true };
  });
}

export function startUpdateChecks(): void {
  if (supportsAutoInstall) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: UPDATE_FEED_URL
    });
    autoUpdater.autoDownload = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
  }

  autoUpdater.on('checking-for-update', () => {
    publish({
      state: 'checking',
      message: 'Controllo aggiornamenti…',
      lastCheckedAt: new Date().toISOString(),
      percent: undefined,
      error: undefined
    });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    publish({
      state: 'available',
      latestVersion: versionFrom(info),
      message: `Aggiornamento ${versionFrom(info) ?? ''} disponibile. Download in corso…`.trim()
    });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    publish({
      state: 'not-available',
      latestVersion: versionFrom(info),
      message: 'Stai usando la versione più recente.',
      percent: undefined
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    publish({
      state: 'downloading',
      message: 'Download aggiornamento in corso…',
      percent: Math.round(progress.percent)
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    publish({
      state: 'downloaded',
      latestVersion: versionFrom(info),
      message: `Aggiornamento ${versionFrom(info) ?? ''} pronto. Riavvia per installare.`.trim(),
      percent: 100
    });
  });

  autoUpdater.on('error', (error: Error) => {
    publish({
      state: 'error',
      message: 'Impossibile completare il controllo aggiornamenti.',
      error: errorMessage(error)
    });
  });

  if (!app.isPackaged) {
    publish({
      state: 'idle',
      message: 'Aggiornamenti automatici disponibili solo nella versione installata.'
    });
    return;
  }

  setTimeout(() => {
    void checkForUpdates();
  }, 5000);

  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(() => {
    void checkForUpdates();
  }, CHECK_INTERVAL_MS);
}
