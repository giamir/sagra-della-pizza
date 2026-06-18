/**
 * ECR17 / Ingenico-SICA TCP protocol client.
 *
 * Frame format:  STX | field1 | FS | field2 | FS | … | ETX | LRC
 *   STX = 0x02, ETX = 0x03, FS = 0x1C
 *   LRC = XOR of every byte from STX (inclusive) through ETX (inclusive)
 *
 * The terminal may send a bare ACK (0x06) before the response frame — we skip it.
 *
 * Purchase request fields:
 *   [0] = "01"            – transaction type (Vendita)
 *   [1] = 9-digit amount  – cents, zero-padded ("000001500" = €15.00)
 *   [2] = "978"           – ISO-4217 EUR (optional on EUR-only terminals)
 *
 * Purchase response fields:
 *   [0] = result code     – "00" = approved
 *   [1] = amount (echo)
 *   [2] = authorization code
 *   [3…] = receipt / extra data
 *
 * If your terminal needs a different field order or uses a different
 * LRC convention, adjust buildFrame / parseFrame / FIELDS_* below.
 */

import * as net from 'net';

const STX = 0x02;
const ETX = 0x03;
const FS  = 0x1c;
const ACK = 0x06;

function lrc(data: Buffer): number {
  let v = 0;
  for (let i = 0; i < data.length; i++) v ^= data[i];
  return v;
}

function buildFrame(fields: string[]): Buffer {
  const body = Buffer.from(fields.join(String.fromCharCode(FS)), 'latin1');
  const frame = Buffer.allocUnsafe(1 + body.length + 1 + 1);
  let i = 0;
  frame[i++] = STX;
  body.copy(frame, i); i += body.length;
  frame[i++] = ETX;
  // LRC = XOR of every byte from STX (inclusive) through ETX (inclusive)
  frame[i++] = lrc(frame.slice(0, i));
  return frame;
}

function parseFrame(buf: Buffer): string[] {
  // Skip any leading ACK bytes
  let start = 0;
  while (start < buf.length && buf[start] === ACK) start++;

  const stx = buf.indexOf(STX, start);
  if (stx === -1) throw new Error('STX non trovato');
  const etx = buf.indexOf(ETX, stx + 1);
  if (etx === -1) throw new Error('Frame incompleto (ETX mancante)');

  const body = buf.slice(stx + 1, etx).toString('latin1');
  return body.split(String.fromCharCode(FS));
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
};

export const ECR17_DEFAULTS: ECR17Config = {
  enabled: false,
  host: '192.168.1.50',
  port: 7500,
};

/**
 * Send a purchase request to the Nexi/Ingenico terminal.
 * Resolves when the terminal responds (approved or declined).
 * Rejects on TCP/timeout errors.
 */
export function requestPayment(
  config: ECR17Config,
  amountCents: number,
  timeoutMs = 120_000
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

    socket.setTimeout(timeoutMs);

    socket.connect(config.port, config.host, () => {
      const frame = buildFrame([
        '01',
        String(amountCents).padStart(9, '0'),
        '978',
      ]);
      socket.write(frame);
    });

    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);

      // Find the start of the response frame — skip ACKs, NAKs, or any
      // preamble bytes the terminal sends before the actual STX frame.
      const stx = buf.indexOf(STX);
      if (stx === -1) return; // no frame start yet — accumulate

      const etx = buf.indexOf(ETX, stx + 1);
      if (etx === -1) return; // incomplete frame — accumulate

      try {
        const fields = parseFrame(buf.slice(stx));
        // Send ACK back to terminal
        socket.write(Buffer.from([ACK]));
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
    // Transaction type "05" = Storno/Cancel
    const frame = buildFrame(['05']);
    socket.write(frame);
    socket.write(Buffer.from([ACK]));
    socket.destroy();
  });
  socket.on('error', () => socket.destroy());
}
