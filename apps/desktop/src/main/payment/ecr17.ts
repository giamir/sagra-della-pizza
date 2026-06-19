/**
 * ECR17 / Ingenico-SICA TCP protocol client for Nexi SmartPOS.
 *
 * Frame format:  STX | field1 | FS | field2 | FS | … | ETX | LRC
 *   STX = 0x02, ETX = 0x03, FS = 0x1C
 *   LRC = XOR(message bytes + ETX) with initial value 0x7F  [Nexi ECR17 spec]
 *
 * Purchase request fields:
 *   [0] = "01"            – transaction type (Vendita)
 *   [1] = 9-digit amount  – cents, zero-padded ("000001500" = €15.00)
 *
 * Purchase response fields:
 *   [0] = result code     – "00" = approved
 *   [1] = amount (echo)
 *   [2] = authorization code
 *   [3…] = receipt / extra data
 */

import * as net from 'net';

const STX = 0x02;
const ETX = 0x03;
const ACK = 0x06;

function hex(buf: Buffer): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function normalizeByte(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255) return value;
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{1,2}$/.test(trimmed)) return fallback;
  return parseInt(trimmed, 16);
}

function lrc(data: Buffer, seed: number): number {
  let v = seed;
  for (let i = 0; i < data.length; i++) v ^= data[i];
  return v;
}

function buildFrame(fields: string[], config: ECR17Config): Buffer {
  const separator = normalizeByte(config.fieldSeparatorHex, 0x1c);
  const seed = normalizeByte(config.lrcSeedHex, 0x7f);
  const body   = Buffer.from(fields.join(String.fromCharCode(separator)), 'latin1');
  const etxPos = 1 + body.length;   // index of ETX
  const lrcPos = etxPos + 1;        // index of LRC
  const frame  = Buffer.allocUnsafe(lrcPos + 1);

  frame[0] = STX;
  body.copy(frame, 1);
  frame[etxPos] = ETX;
  // LRC = XOR of message bytes + ETX, base value 0x7F (Nexi ECR17 spec)
  frame[lrcPos] = lrc(frame.slice(config.lrcIncludesStx ? 0 : 1, lrcPos), seed);
  return frame;
}

function parseFrame(buf: Buffer, config: ECR17Config): string[] {
  const stx = buf.indexOf(STX);
  if (stx === -1) throw new Error('STX non trovato');
  const etx = buf.indexOf(ETX, stx + 1);
  if (etx === -1) throw new Error('Frame incompleto (ETX mancante)');

  const separator = normalizeByte(config.fieldSeparatorHex, 0x1c);
  const body = buf.slice(stx + 1, etx).toString('latin1');
  return body.split(String.fromCharCode(separator));
}

export type ECR17Result = {
  approved: boolean;
  responseCode: string;
  authCode: string;
  amountCents: number;
  receiptLines: string[];
};

export type ECR17Config = {
  enabled: boolean;
  host: string;
  port: number;
  timeoutMs: number;
  fieldSeparatorHex: string;
  lrcSeedHex: string;
  lrcIncludesStx: boolean;
  purchaseCode: string;
  cancelCode: string;
  amountDigits: number;
  sendAckOnResponse: boolean;
  sendAckOnCancel: boolean;
};

export const ECR17_DEFAULTS: ECR17Config = {
  enabled: false,
  host: '192.168.1.50',
  port: 8220,
  timeoutMs: 120_000,
  fieldSeparatorHex: '1C',
  lrcSeedHex: '7F',
  lrcIncludesStx: false,
  purchaseCode: '01',
  cancelCode: '05',
  amountDigits: 9,
  sendAckOnResponse: true,
  sendAckOnCancel: true,
};

export function testECR17Connection(config: ECR17Config): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    }

    socket.setTimeout(Math.min(Math.max(config.timeoutMs || 5000, 1000), 15000));
    socket.connect(config.port, config.host, () => settle(resolve));
    socket.on('timeout', () => settle(() => reject(new Error('Timeout: terminale non raggiungibile'))));
    socket.on('error', (err: Error) => settle(() => reject(err)));
  });
}

/**
 * Send a purchase request to the Nexi/Ingenico terminal.
 * Resolves when the terminal responds (approved or declined).
 * Rejects on TCP/timeout errors.
 */
export function requestPayment(
  config: ECR17Config,
  amountCents: number
): Promise<ECR17Result> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let settled = false;

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    }

    socket.setTimeout(config.timeoutMs || ECR17_DEFAULTS.timeoutMs);

    socket.connect(config.port, config.host, () => {
      const frame = buildFrame([
        config.purchaseCode || ECR17_DEFAULTS.purchaseCode,
        String(amountCents).padStart(config.amountDigits || ECR17_DEFAULTS.amountDigits, '0'),
      ], config);
      const etxPos = frame.indexOf(ETX);
      console.log('[ECR17] SEND:', hex(frame));
      console.log('[ECR17] LRC candidates — body_only:', frame[etxPos + 1].toString(16).padStart(2,'0').toUpperCase(),
        '| body+ETX seed 7F:', lrc(frame.slice(1, etxPos + 1), 0x7f).toString(16).padStart(2,'0').toUpperCase(),
        '| STX+body+ETX seed 7F:', lrc(frame.slice(0, etxPos + 1), 0x7f).toString(16).padStart(2,'0').toUpperCase());
      socket.write(frame);
    });

    socket.on('data', (chunk: Buffer) => {
      console.log('[ECR17] RECV:', hex(chunk));
      buf = Buffer.concat([buf, chunk]);

      const stx = buf.indexOf(STX);
      if (stx === -1) return; // no frame start yet — accumulate

      const etx = buf.indexOf(ETX, stx + 1);
      if (etx === -1) return; // incomplete frame — accumulate

      try {
        const fields = parseFrame(buf.slice(stx), config);
        console.log('[ECR17] fields:', fields);
        if (config.sendAckOnResponse) socket.write(Buffer.from([ACK]));
        settle(() => {
          const responseCode = fields[0] ?? '';
          resolve({
            approved: responseCode === '00',
            responseCode,
            amountCents: parseInt(fields[1] ?? '0', 10),
            authCode: fields[2] ?? '',
            receiptLines: fields.slice(3).filter(Boolean),
          });
        });
      } catch (err) {
        settle(() => reject(err));
      }
    });

    socket.on('timeout', () =>
      settle(() => reject(new Error('Timeout: nessuna risposta dal terminale')))
    );

    socket.on('error', (err: Error) => settle(() => reject(err)));
  });
}

/**
 * Send a cancellation / abort to the terminal.
 * Best-effort — ignores errors.
 */
export function cancelPayment(config: ECR17Config): void {
  const socket = new net.Socket();
  socket.setTimeout(5000);
  socket.connect(config.port, config.host, () => {
    const frame = buildFrame([config.cancelCode || ECR17_DEFAULTS.cancelCode], config);
    console.log('[ECR17] CANCEL SEND:', hex(frame));
    socket.write(frame);
    if (config.sendAckOnCancel) socket.write(Buffer.from([ACK]));
    socket.destroy();
  });
  socket.on('error', () => socket.destroy());
}
