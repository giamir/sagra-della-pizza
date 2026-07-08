import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

const api = {
  // Till settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  getLocalNetworkAddresses: () => ipcRenderer.invoke('settings:network-addresses:get'),

  // App / updates
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:status:get'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openReleases: () => ipcRenderer.invoke('updates:open-releases'),
  onUpdateStatus: (cb: (status: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: unknown) => cb(status);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
  onVersionMismatch: (
    cb: (info: { mismatch: boolean; hostVersion: string; localVersion: string }) => void
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      info: { mismatch: boolean; hostVersion: string; localVersion: string }
    ) => cb(info);
    ipcRenderer.on('version:mismatch', listener);
    return () => ipcRenderer.removeListener('version:mismatch', listener);
  },

  // Orders
  submitOrder: (order: unknown) => ipcRenderer.invoke('order:submit', order),
  onIncomingOrder: (
    cb: (payload: { v?: number; p: number; l: [string, number][]; t: number }) => void
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      payload: { v?: number; p: number; l: [string, number][]; t: number }
    ) => cb(payload);
    ipcRenderer.on('order:incoming', listener);
    return () => ipcRenderer.removeListener('order:incoming', listener);
  },

  // Printing
  printOrder: (orderId: number | bigint) => ipcRenderer.invoke('print:order', orderId),
  printOrderData: (order: unknown) => ipcRenderer.invoke('print:orderData', order),
  printTest: () => ipcRenderer.invoke('print:test'),
  getPrinterConfig: () => ipcRenderer.invoke('printer:config:get'),
  savePrinterConfig: (config: unknown) => ipcRenderer.invoke('printer:config:save', config),
  listPrinters: () => ipcRenderer.invoke('printer:list'),

  // Reports
  getReports: (from: string, to: string) => ipcRenderer.invoke('reports:get', from, to),
  voidOrder: (orderId: string) => ipcRenderer.invoke('order:void', orderId),

  // Cash floats (fondo cassa per till)
  getCashFloats: (date: string) => ipcRenderer.invoke('cash:get', date),
  setCashFloat: (tillName: string, date: string, fondoCents: number, countedCents: number | null) =>
    ipcRenderer.invoke('cash:set', tillName, date, fondoCents, countedCents),

  // Payment terminal (ECR17 / Nexi Ingenico)
  getPaymentConfig: () => ipcRenderer.invoke('payment:config:get'),
  savePaymentConfig: (config: unknown) => ipcRenderer.invoke('payment:config:save', config),
  testPaymentConnection: () => ipcRenderer.invoke('payment:test-connection'),
  startPayment: (amountCents: number) => ipcRenderer.invoke('payment:start', amountCents),
  cancelPayment: () => ipcRenderer.invoke('payment:cancel'),

  // Stock
  getStock: () => ipcRenderer.invoke('stock:get'),
  setStock: (itemId: string, qty: number) => ipcRenderer.invoke('stock:set', itemId, qty),
  resetStock: (itemId: string) => ipcRenderer.invoke('stock:reset', itemId),
  onStockUpdate: (
    cb: (data: { stock: Record<string, number>; reserved: Record<string, number> }) => void
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      data: { stock: Record<string, number>; reserved: Record<string, number> }
    ) => cb(data);
    ipcRenderer.on('stock:update', listener);
    return () => ipcRenderer.removeListener('stock:update', listener);
  },

  // Reservations (soft cart holds — live "rimasti" across tills)
  getReservations: () => ipcRenderer.invoke('reservations:get'),
  setReservation: (lines: [string, number][]) => ipcRenderer.invoke('reservations:set', lines),

  // Catalog admin
  getCatalog: () => ipcRenderer.invoke('catalog:get'),
  saveCatalog: (catalog: unknown, stations: unknown, stationList: unknown, copertoStation: unknown) =>
    ipcRenderer.invoke('catalog:save', catalog, stations, stationList, copertoStation),
  exportCatalog: () => ipcRenderer.invoke('catalog:export'),
  resetCatalog: () => ipcRenderer.invoke('catalog:reset'),

  // Database backup / restore
  exportDatabase: () => ipcRenderer.invoke('database:export'),
  importDatabase: () => ipcRenderer.invoke('database:import'),
  resetDatabase: (includeSettings = false) => ipcRenderer.invoke('database:reset', includeSettings)
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (err) {
    console.error(err);
  }
} else {
  // @ts-ignore
  window.electron = electronAPI;
  // @ts-ignore
  window.api = api;
}

export type Api = typeof api;
