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
  tcpTimeoutMs: number;
  tcpCloseDelayMs: number;
  usbWriteMode: 'auto' | 'cups' | 'file';
  usbPrintCommand: 'lp' | 'lpr';
  usbRawOption: string;
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
  tcpTimeoutMs: 5000,
  tcpCloseDelayMs: 200,
  usbWriteMode: 'auto',
  usbPrintCommand: 'lp',
  usbRawOption: 'raw',
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

export type UsbPrinterEntry = { label: string; value: string };

// Returns available printers for the USB picker.
// macOS/Linux: CUPS queue names via `lpstat -a` → label === value (CUPS name).
// Windows: queries WMI for Name+PortName; only physical ports (USB*, COM*, LPT*) are
// included; value is the port name so sendToUsbPrinter can write to \\.\<port>.
export async function listUsbPrinters(): Promise<UsbPrinterEntry[]> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const fallback: UsbPrinterEntry[] = [
        { label: 'USB001', value: 'USB001' },
        { label: 'COM1', value: 'COM1' },
        { label: 'LPT1', value: 'LPT1' },
      ];
      execFile('wmic', ['path', 'Win32_Printer', 'get', 'Name,PortName', '/format:list'], (err, stdout) => {
        if (err) { resolve(fallback); return; }
        const entries: UsbPrinterEntry[] = [];
        // /format:list emits blocks like "Name=...\r\nPortName=...\r\n" separated by blank lines
        for (const block of stdout.split(/\r?\n\r?\n/)) {
          const name = block.match(/^Name=(.+)$/m)?.[1]?.trim();
          const port = block.match(/^PortName=(.+)$/m)?.[1]?.trim();
          if (name && port && /^(USB|COM|LPT)\d*/i.test(port)) {
            entries.push({ label: `${name} (${port})`, value: port });
          }
        }
        resolve(entries.length ? entries : fallback);
      });
    });
  }
  return new Promise((resolve) => {
    execFile('lpstat', ['-a'], (err, stdout) => {
      if (err) { resolve([]); return; }
      const entries = stdout
        .split('\n')
        .map((l) => l.split(' ')[0].trim())
        .filter(Boolean)
        .map((name) => ({ label: name, value: name }));
      resolve(entries);
    });
  });
}

export function savePrinterConfig(config: PrinterConfig): void {
  setSetting('printer_config', JSON.stringify(config));
}

export async function sendToTcpPrinter(
  host: string,
  port: number,
  data: Buffer,
  timeoutMs = DEFAULTS.tcpTimeoutMs,
  closeDelayMs = DEFAULTS.tcpCloseDelayMs
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(port, host);
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.write(data, (err) => {
        if (err) { socket.destroy(); reject(err); return; }
        setTimeout(() => socket.end(), closeDelayMs);
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
// On Windows: target is a port name (USB001, COM3, LPT1); we open it as a Win32
// device path (\\.\USB001) so Node's fs can write raw bytes directly.
export async function sendToUsbPrinter(
  target: string,
  data: Buffer,
  options: Pick<PrinterConfig, 'usbWriteMode' | 'usbPrintCommand' | 'usbRawOption'> = DEFAULTS
): Promise<void> {
  if (!target) throw new Error('Nessuna stampante USB configurata');

  const mode = options.usbWriteMode ?? 'auto';
  const directFile = mode === 'file' || (mode === 'auto' && (process.platform === 'win32' || target.startsWith('/')));

  if (directFile) {
    // On Windows, port names like USB001/COM3/LPT1 must be opened as \\.\<port>
    const filePath = (process.platform === 'win32' && !target.startsWith('\\') && !target.startsWith('/'))
      ? `\\\\.\\${target}`
      : target;
    await writeFile(filePath, data);
    return;
  }

  // CUPS raw print (macOS / Linux printer name)
  return new Promise((resolve, reject) => {
    const command = options.usbPrintCommand === 'lpr' ? 'lpr' : 'lp';
    const rawOption = (options.usbRawOption || 'raw').trim();
    const args = command === 'lpr'
      ? ['-P', target, ...(rawOption ? ['-o', rawOption] : [])]
      : ['-d', target, ...(rawOption ? ['-o', rawOption] : []), '-'];
    const proc = spawn(command, args);
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
