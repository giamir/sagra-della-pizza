import { app, BrowserWindow, shell, nativeImage } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { registerOrderHandlers } from './ipc/orders.js';
import { registerPrintingHandlers } from './ipc/printing.js';
import { registerSettingsHandlers, loadTillSettings, applyServerRole } from './ipc/settings.js';
import { registerStockHandlers } from './ipc/stock.js';
import { registerPaymentHandlers } from './ipc/payment.js';
import { registerReportsHandlers } from './ipc/reports.js';
import { registerCashHandlers } from './ipc/cash.js';
import { registerCatalogHandlers } from './ipc/catalog.js';
import { registerBackupHandlers } from './ipc/backup.js';
import { registerUpdateHandlers, startUpdateChecks } from './ipc/updates.js';
import { snapshotDb, pruneSnapshots } from './db/auto-backup.js';

let mainWindow: BrowserWindow | null = null;

function getIcon() {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'logo.png')
    : join(__dirname, '../../../../resources/logo.png');
  return nativeImage.createFromPath(iconPath);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'Sagra della Pizza',
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: getIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow!.show());

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerSettingsHandlers();
  registerOrderHandlers();
  registerPrintingHandlers();
  registerStockHandlers();
  registerPaymentHandlers();
  registerReportsHandlers();
  registerCashHandlers();
  registerCatalogHandlers();
  registerBackupHandlers();
  registerUpdateHandlers();

  // Start the embedded server if this till is configured as host
  const tillSettings = loadTillSettings();
  applyServerRole(tillSettings);

  // Only the host holds live data, so only the host keeps snapshots. Take a
  // routine copy of the pre-session DB and trim old ones.
  if (tillSettings.role === 'host') {
    snapshotDb('startup');
    pruneSnapshots();
  }

  createWindow();
  startUpdateChecks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
