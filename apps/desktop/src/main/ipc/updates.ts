import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

const RELEASES_URL = 'https://github.com/giamir/sagra-della-pizza/releases';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  isPackaged: boolean;
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
  message: app.isPackaged
    ? 'Aggiornamenti automatici pronti.'
    : 'Aggiornamenti automatici disponibili solo nella versione installata.'
};
let checkTimer: NodeJS.Timeout | null = null;

function publish(next: Partial<UpdateStatus>): UpdateStatus {
  status = {
    ...status,
    ...next,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged
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
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Errore aggiornamento sconosciuto.';
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
  ipcMain.handle('updates:install', () => {
    if (status.state !== 'downloaded') return { ok: false, error: 'Nessun aggiornamento pronto da installare.' };
    autoUpdater.quitAndInstall();
    return { ok: true };
  });
  ipcMain.handle('updates:open-releases', async () => {
    await shell.openExternal(RELEASES_URL);
    return { ok: true };
  });
}

export function startUpdateChecks(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

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
