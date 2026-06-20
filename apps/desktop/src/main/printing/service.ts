import { createConnection } from 'net';
import { writeFile, unlink } from 'fs/promises';
import { spawn, execFile } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
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
// Windows: queries the spooler for Name+PortName; only printers on physical ports
// (USB*, COM*, LPT*) are included. The VALUE is the printer NAME (not the port), because
// raw bytes are delivered through the spooler by name — see sendToWindowsSpooler.
export async function listUsbPrinters(): Promise<UsbPrinterEntry[]> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const fallback: UsbPrinterEntry[] = [];
      const script =
        'Get-CimInstance Win32_Printer | ' +
        'Select-Object Name,PortName | ConvertTo-Json -Compress';
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true },
        (err, stdout) => {
          if (err || !stdout.trim()) { resolve(fallback); return; }
          let parsed: unknown;
          try { parsed = JSON.parse(stdout); } catch { resolve(fallback); return; }
          const rows = (Array.isArray(parsed) ? parsed : [parsed]) as { Name?: string; PortName?: string }[];
          const entries: UsbPrinterEntry[] = [];
          for (const row of rows) {
            const name = row?.Name?.trim();
            const port = row?.PortName?.trim();
            // Only physical ports; this naturally excludes PDF/XPS/Fax/OneNote virtual printers.
            if (name && port && /^(USB|COM|LPT)\d*/i.test(port)) {
              entries.push({ label: `${name} (${port})`, value: name });
            }
          }
          resolve(entries);
        }
      );
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

// Sends raw ESC/POS bytes to the Windows print spooler addressed by printer NAME, using
// the RAW datatype so the bytes reach the printer untouched. This is the supported path
// for USB receipt printers — there is no \\.\USB001 device to write to directly.
async function sendToWindowsSpooler(printerName: string, data: Buffer): Promise<void> {
  const id = randomUUID();
  const dataFile = join(tmpdir(), `sagra-print-${id}.bin`);
  const scriptFile = join(tmpdir(), `sagra-print-${id}.ps1`);
  const psScript = `param([string]$PrinterName, [string]$DataFile)
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFOW { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool StartDocPrinter(IntPtr h, int level, ref DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)] static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
  public static void Send(string printerName, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printerName, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed (" + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFOW di = new DOCINFOW(); di.pDocName = "Sagra ESC/POS"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, ref di)) throw new Exception("StartDocPrinter failed (" + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed (" + Marshal.GetLastWin32Error() + ")");
        IntPtr buf = Marshal.AllocHGlobal(bytes.Length);
        try {
          Marshal.Copy(bytes, 0, buf, bytes.Length);
          int written;
          if (!WritePrinter(h, buf, bytes.Length, out written)) throw new Exception("WritePrinter failed (" + Marshal.GetLastWin32Error() + ")");
        } finally { Marshal.FreeHGlobal(buf); }
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
Add-Type -TypeDefinition $code -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($DataFile)
[RawPrinterHelper]::Send($PrinterName, $bytes)`;

  await writeFile(dataFile, data);
  await writeFile(scriptFile, psScript, 'utf8');
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptFile,
          '-PrinterName', printerName, '-DataFile', dataFile],
        { windowsHide: true }
      );
      let stderr = '';
      proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Stampa Windows fallita (codice ${code}): ${stderr.trim() || 'errore sconosciuto'}`));
      });
      proc.on('error', (err) => reject(new Error(`PowerShell non trovato: ${err.message}`)));
    });
  } finally {
    await unlink(dataFile).catch(() => {});
    await unlink(scriptFile).catch(() => {});
  }
}

// Sends raw ESC/POS bytes to a USB-attached printer.
// On Windows: deliver through the print spooler by printer NAME (RAW datatype). The
// "Scrittura diretta" advanced mode is an escape hatch for real serial/parallel ports
// (COM1/LPT1), which — unlike USB — are openable as \\.\<port> device paths.
// On macOS/Linux: if target starts with '/' treat as device path (write directly),
// otherwise assume it's a CUPS queue name and use `lp -d target -o raw`.
export async function sendToUsbPrinter(
  target: string,
  data: Buffer,
  options: Pick<PrinterConfig, 'usbWriteMode' | 'usbPrintCommand' | 'usbRawOption'> = DEFAULTS
): Promise<void> {
  if (!target) throw new Error('Nessuna stampante USB configurata');

  const mode = options.usbWriteMode ?? 'auto';

  if (process.platform === 'win32') {
    if (mode === 'file') {
      // Escape hatch: write directly to a real device port (COM1/LPT1) as \\.\<port>.
      const filePath = target.startsWith('\\') || target.startsWith('/') ? target : `\\\\.\\${target}`;
      await writeFile(filePath, data);
      return;
    }
    await sendToWindowsSpooler(target, data);
    return;
  }

  const directFile = mode === 'file' || (mode === 'auto' && target.startsWith('/'));
  if (directFile) {
    await writeFile(target, data);
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
