import { ipcMain } from 'electron';
import { getSetting, setSetting } from '../db/schema.js';
import {
  requestPayment,
  cancelPayment,
  ECR17_DEFAULTS,
  type ECR17Config,
  type ECR17Result,
} from '../payment/ecr17.js';

export function loadECR17Config(): ECR17Config {
  const raw = getSetting('ecr17_config');
  if (!raw) return { ...ECR17_DEFAULTS };
  try { return { ...ECR17_DEFAULTS, ...JSON.parse(raw) }; }
  catch { return { ...ECR17_DEFAULTS }; }
}

export function registerPaymentHandlers(): void {
  ipcMain.handle('payment:config:get', () => loadECR17Config());

  ipcMain.handle('payment:config:save', (_event, config: ECR17Config) => {
    setSetting('ecr17_config', JSON.stringify(config));
    return { ok: true };
  });

  ipcMain.handle('payment:start', async (_event, amountCents: number) => {
    const config = loadECR17Config();
    if (!config.enabled) {
      return { ok: false, error: 'Terminale non configurato' };
    }
    try {
      const result: ECR17Result = await requestPayment(config, amountCents);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Errore terminale' };
    }
  });

  ipcMain.handle('payment:cancel', () => {
    const config = loadECR17Config();
    if (config.enabled) cancelPayment(config);
    return { ok: true };
  });
}
