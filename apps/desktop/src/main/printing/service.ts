import { createConnection } from 'net';
import { writeFile } from 'fs/promises';
import { spawn, execFile } from 'child_process';
import { getSetting, setSetting } from '../db/schema.js';
import { STATION_ORDER, normalizeStation } from './station-map.js';

export type StationConfig = {
  name: string;
  enabled: boolean;
};

export type PrinterConfig = {
  enabled: boolean;
  connectionType: 'tcp' | 'usb';
  host: string;
  port: number;
  usbTarget: string; // CUPS printer name (macOS) or device path (/dev/usb/lp0) or COM port (Windows)
  width: number; // 32 (58mm), 42 or 48 (80mm)
  stations: StationConfig[];
};

function defaultStations(): StationConfig[] {
  return STATION_ORDER.map((name) => ({ name, enabled: true }));
}

const DEFAULTS: PrinterConfig = {
  enabled: false,
  connectionType: 'tcp',
  host: '192.168.1.100',
  port: 9100,
  usbTarget: '',
  width: 42,
  stations: defaultStations()
};

export function loadPrinterConfig(): PrinterConfig {
  const raw = getSetting('printer_config');
  if (!raw) return structuredClone(DEFAULTS);
  try {
    const saved = JSON.parse(raw) as Partial<PrinterConfig>;
    const savedMap = new Map((saved.stations ?? []).map((s) => [normalizeStation(s.name), { ...s, name: normalizeStation(s.name) }]));
    const stations = STATION_ORDER.map((name) => savedMap.get(name) ?? { name, enabled: true });
    return { ...DEFAULTS, ...saved, stations };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

// Returns available printers for the USB picker:
// - macOS/Linux: CUPS queue names via `lpstat -a`
// - Windows: a static list of common COM/LPT ports (enumeration requires WMI)
export async function listUsbPrinters(): Promise<string[]> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile('wmic', ['printer', 'get', 'name'], (err, stdout) => {
        if (err) {
          resolve(['COM1', 'COM2', 'COM3', 'LPT1']);
          return;
        }
        const names = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && l !== 'Name');
        resolve(names.length ? names : ['COM1', 'COM2', 'COM3', 'LPT1']);
      });
    });
  }
  return new Promise((resolve) => {
    execFile('lpstat', ['-a'], (err, stdout) => {
      if (err) { resolve([]); return; }
      const names = stdout
        .split('\n')
        .map((l) => l.split(' ')[0].trim())
        .filter(Boolean);
      resolve(names);
    });
  });
}

export function savePrinterConfig(config: PrinterConfig): void {
  setSetting('printer_config', JSON.stringify(config));
}

export async function sendToTcpPrinter(host: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(port, host);
    socket.setTimeout(5000);
    socket.on('connect', () => {
      socket.write(data, (err) => {
        if (err) { socket.destroy(); reject(err); return; }
        setTimeout(() => socket.end(), 200);
      });
    });
    socket.on('close', () => resolve());
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Stampante ${host}:${port} non raggiungibile (timeout)`));
    });
    socket.on('error', (err) => reject(new Error(`Errore stampante: ${err.message}`)));
  });
}

// Sends raw ESC/POS bytes to a USB-attached printer.
// On macOS/Linux: if target starts with '/' treat as device path (write directly),
// otherwise assume it's a CUPS queue name and use `lp -d target -o raw`.
// On Windows: write directly to the device path (e.g. COM3, LPT1:).
export async function sendToUsbPrinter(target: string, data: Buffer): Promise<void> {
  if (!target) throw new Error('Nessuna stampante USB configurata');

  if (process.platform === 'win32' || target.startsWith('/')) {
    await writeFile(target, data);
    return;
  }

  // CUPS raw print (macOS / Linux printer name)
  return new Promise((resolve, reject) => {
    const proc = spawn('lp', ['-d', target, '-o', 'raw', '-']);
    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.stdin.write(data, (err) => {
      if (err) { proc.kill(); reject(new Error(`Errore scrittura stdin: ${err.message}`)); return; }
      proc.stdin.end();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`lp errore (codice ${code}): ${stderr.trim() || 'sconosciuto'}`));
    });
    proc.on('error', (err) => reject(new Error(`Comando lp non trovato: ${err.message}`)));
  });
}
