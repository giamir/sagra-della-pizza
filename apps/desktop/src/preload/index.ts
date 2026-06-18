import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

const api = {
  // Till settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),

  // Orders
  submitOrder: (order: unknown) => ipcRenderer.invoke('order:submit', order),

  // Printing
  printOrder: (orderId: number | bigint) => ipcRenderer.invoke('print:order', orderId),
  printTest: () => ipcRenderer.invoke('print:test'),
  getPrinterConfig: () => ipcRenderer.invoke('printer:config:get'),
  savePrinterConfig: (config: unknown) => ipcRenderer.invoke('printer:config:save', config),
  listPrinters: () => ipcRenderer.invoke('printer:list'),

  // Reports
  getReports: (from: string, to: string) => ipcRenderer.invoke('reports:get', from, to),
  voidOrder: (orderId: string) => ipcRenderer.invoke('order:void', orderId),

  // Payment terminal (ECR17 / Nexi Ingenico)
  getPaymentConfig: () => ipcRenderer.invoke('payment:config:get'),
  savePaymentConfig: (config: unknown) => ipcRenderer.invoke('payment:config:save', config),
  startPayment: (amountCents: number) => ipcRenderer.invoke('payment:start', amountCents),
  cancelPayment: () => ipcRenderer.invoke('payment:cancel'),

  // Stock
  getStock: () => ipcRenderer.invoke('stock:get'),
  setStock: (itemId: string, qty: number) => ipcRenderer.invoke('stock:set', itemId, qty),
  resetStock: (itemId: string) => ipcRenderer.invoke('stock:reset', itemId),
  onStockUpdate: (cb: (stock: Record<string, number>) => void) => {
    const listener = (_: Electron.IpcRendererEvent, stock: Record<string, number>) => cb(stock);
    ipcRenderer.on('stock:update', listener);
    return () => ipcRenderer.removeListener('stock:update', listener);
  },

  // Catalog admin
  getCatalog: () => ipcRenderer.invoke('catalog:get'),
  saveCatalog: (catalog: unknown, stations: unknown) => ipcRenderer.invoke('catalog:save', catalog, stations),
  exportCatalog: () => ipcRenderer.invoke('catalog:export')
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
