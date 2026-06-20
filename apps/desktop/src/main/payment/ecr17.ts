/**
 * Nexi ECR-LAN / ECR17 TCP protocol client for Nexi SmartPOS.
 *
 * Frame format:  STX | fixed-width application message | ETX | LRC
 *   STX = 0x02, ETX = 0x03
 *   LRC = XOR(application message bytes + ETX) with initial value 0x7F.
 *
 * Purchase request fields:
 *   Terminal ID       8 chars ("00000000" means no terminal ID check)
 *   Reserved          1 char  ("0")
 *   Message code      1 char  ("P" sale, "X" sale with extended result)
 *   Cash register ID  8 chars
 *   Additional data   1 char  ("0")
 *   Reserved          2 chars ("00")
 *   Card present      1 char  ("0")
 *   Payment type      1 char  ("0" automatic recognition)
 *   Amount            8 chars, cents, zero-padded ("00001500" = €15.00)
 *   Receipt text      128 chars, left padded with spaces
 *   Reserved          8 chars ("00000000")
 *
 * Purchase response fields:
 *   Message code      1 char  ("E" normal/extended result, "V" DCC result)
 *   Result code       2 chars ("00" approved)
 */

import * as net from 'net';

const STX = 0x02;
const SOH = 0x01;
const ETX = 0x03;
const EOT = 0x04;
const ACK = 0x06;
const NAK = 0x15;

const TERMINAL_ID_LEN = 8;
const CASH_REGISTER_ID_LEN = 8;
const AMOUNT_LEN = 8;
const RECEIPT_TEXT_LEN = 128;
const PAYMENT_REQUEST_LEN = 167;
const TERMINAL_STATUS_REQUEST_LEN = 10;

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

function digits(value: string | undefined, length: number, fallback: string): string {
  const raw = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  return (raw || fallback).slice(-length).padStart(length, '0');
}

function paymentMessageCode(value: string | undefined): 'P' | 'X' {
  const code = (value || '').trim().toUpperCase();
  return code === 'X' ? 'X' : 'P';
}

function leftPadAscii(value: string, length: number, pad = ' '): string {
  const ascii = value.replace(/[^\x20-\x7E]/g, ' ');
  return ascii.slice(-length).padStart(length, pad);
}

function fixedAmount(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error('Importo non valido per il terminale');
  }
  if (amountCents > 99_999_999) {
    throw new Error('Importo troppo alto per il terminale Nexi');
  }
  return String(amountCents).padStart(AMOUNT_LEN, '0');
}

function buildApplicationFrame(message: string, config: ECR17Config): Buffer {
  const seed = normalizeByte(config.lrcSeedHex, 0x7f);
  const body = Buffer.from(message, 'ascii');
  const etxPos = 1 + body.length;   // index of ETX
  const lrcPos = etxPos + 1;        // index of LRC
  const frame  = Buffer.allocUnsafe(lrcPos + 1);

  frame[0] = STX;
  body.copy(frame, 1);
  frame[etxPos] = ETX;
  frame[lrcPos] = lrc(frame.slice(1, lrcPos), seed);
  return frame;
}

function buildPaymentFrame(config: ECR17Config, amountCents: number): Buffer {
  const message = [
    digits(config.terminalId, TERMINAL_ID_LEN, ECR17_DEFAULTS.terminalId),
    '0',
    paymentMessageCode(config.purchaseCode),
    digits(config.cashRegisterId, CASH_REGISTER_ID_LEN, ECR17_DEFAULTS.cashRegisterId),
    '0',
    '00',
    '0',
    '0',
    fixedAmount(amountCents),
    leftPadAscii('', RECEIPT_TEXT_LEN),
    '00000000',
  ].join('');

  if (message.length !== PAYMENT_REQUEST_LEN) {
    throw new Error(`Messaggio Nexi non valido: lunghezza ${message.length}`);
  }
  return buildApplicationFrame(message, config);
}

function buildTerminalStatusFrame(config: ECR17Config): Buffer {
  const message = [
    digits(config.terminalId, TERMINAL_ID_LEN, ECR17_DEFAULTS.terminalId),
    '0',
    's',
  ].join('');

  if (message.length !== TERMINAL_STATUS_REQUEST_LEN) {
    throw new Error(`Messaggio stato Nexi non valido: lunghezza ${message.length}`);
  }
  return buildApplicationFrame(message, config);
}

function buildReversalFrame(config: ECR17Config): Buffer {
  const message = [
    digits(config.terminalId, TERMINAL_ID_LEN, ECR17_DEFAULTS.terminalId),
    '0',
    'S',
    digits(config.cashRegisterId, CASH_REGISTER_ID_LEN, ECR17_DEFAULTS.cashRegisterId),
    '000000',
    '0',
    '0',
  ].join('');
  return buildApplicationFrame(message, config);
}

function buildConfirmationFrame(kind: typeof ACK | typeof NAK, config: ECR17Config): Buffer {
  const seed = normalizeByte(config.lrcSeedHex, 0x7f);
  const frame = Buffer.from([kind, ETX, 0x00]);
  frame[2] = lrc(frame.slice(0, 2), seed);
  return frame;
}

function parseApplicationFrame(buf: Buffer, config: ECR17Config): string {
  const stx = buf.indexOf(STX);
  if (stx === -1) throw new Error('STX non trovato');
  const etx = buf.indexOf(ETX, stx + 1);
  if (etx === -1) throw new Error('Frame incompleto (ETX mancante)');
  const receivedLrc = buf[etx + 1];
  if (receivedLrc === undefined) throw new Error('Frame incompleto (LRC mancante)');

  const seed = normalizeByte(config.lrcSeedHex, 0x7f);
  const expectedLrc = lrc(buf.slice(stx + 1, etx + 1), seed);
  if (receivedLrc !== expectedLrc) {
    throw new Error(`LRC risposta non valido: atteso ${hex(Buffer.from([expectedLrc]))}, ricevuto ${hex(Buffer.from([receivedLrc]))}`);
  }

  return buf.slice(stx + 1, etx).toString('ascii');
}

function parsePaymentResponse(message: string, amountCents: number): ECR17Result {
  const messageCode = message.slice(9, 10);
  const responseCode = message.slice(10, 12);
  const authCode = responseCode === '00' ? message.slice(34, 40).trim() : '';
  const denialReason = responseCode === '01' ? message.slice(12, 36).trim() : '';
  const responseAmount = message.length >= 82 ? parseInt(message.slice(74, 82), 10) : amountCents;

  return {
    approved: responseCode === '00',
    responseCode,
    amountCents: Number.isFinite(responseAmount) ? responseAmount : amountCents,
    authCode,
    receiptLines: [
      messageCode ? `Messaggio ${messageCode}` : '',
      denialReason,
    ].filter(Boolean),
  };
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
  terminalId: string;
  cashRegisterId: string;
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
  terminalId: '00000000',
  cashRegisterId: '00000001',
  purchaseCode: 'P',
  cancelCode: 'S',
  amountDigits: 8,
  sendAckOnResponse: true,
  sendAckOnCancel: true,
};

export function testECR17Connection(config: ECR17Config): Promise<void> {
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

    socket.setTimeout(Math.min(Math.max(config.timeoutMs || 5000, 1000), 15000));
    socket.connect(config.port, config.host, () => {
      const frame = buildTerminalStatusFrame(config);
      console.log('[ECR17] STATUS SEND:', hex(frame));
      socket.write(frame);
    });
    socket.on('data', (chunk: Buffer) => {
      console.log('[ECR17] STATUS RECV:', hex(chunk));
      buf = Buffer.concat([buf, chunk]);

      if (buf[0] === ACK && buf.length >= 3) {
        console.log('[ECR17] terminal ACK');
        buf = buf.slice(3);
      }
      if (buf[0] === NAK && buf.length >= 3) {
        settle(() => reject(new Error('Terminale Nexi ha rifiutato il test ECR-LAN (NAK): verifica Terminal ID e seed LRC')));
        return;
      }

      const stx = buf.indexOf(STX);
      if (stx === -1) return;
      const etx = buf.indexOf(ETX, stx + 1);
      if (etx === -1 || buf.length <= etx + 1) return;

      try {
        const message = parseApplicationFrame(buf.slice(stx, etx + 2), config);
        console.log('[ECR17] STATUS application message:', message);
        if (message.slice(9, 10) !== 's') {
          throw new Error(`Risposta stato Nexi inattesa: ${message.slice(9, 10)}`);
        }
        if (config.sendAckOnResponse) socket.write(buildConfirmationFrame(ACK, config));
        settle(resolve);
      } catch (err) {
        settle(() => reject(err instanceof Error ? err : new Error('Risposta stato Nexi non valida')));
      }
    });
    socket.on('timeout', () => settle(() => reject(new Error('Timeout: porta TCP aperta, ma nessuna risposta ECR-LAN dal terminale'))));
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
      const frame = buildPaymentFrame(config, amountCents);
      const etxPos = frame.indexOf(ETX);
      const messageLength = Math.max(0, etxPos - 1);
      console.log('[ECR17] SEND:', hex(frame));
      console.log('[ECR17] fixed application message length:', messageLength,
        '| code:', frame.slice(10, 11).toString('ascii'),
        '| amount:', frame.slice(24, 32).toString('ascii'),
        '| LRC:', hex(frame.slice(etxPos + 1, etxPos + 2)));
      socket.write(frame);
    });

    socket.on('data', (chunk: Buffer) => {
      console.log('[ECR17] RECV:', hex(chunk));
      buf = Buffer.concat([buf, chunk]);

      if (buf[0] === ACK && buf.length >= 3) {
        console.log('[ECR17] terminal ACK');
        buf = buf.slice(3);
      }
      if (buf[0] === NAK && buf.length >= 3) {
        settle(() => reject(new Error('Terminale Nexi ha rifiutato il messaggio (NAK): verifica formato/LRC')));
        return;
      }
      while (buf[0] === SOH) {
        const eot = buf.indexOf(EOT, 1);
        if (eot === -1) return;
        console.log('[ECR17] progress:', buf.slice(1, eot).toString('ascii').trim());
        buf = buf.slice(eot + 1);
      }

      const stx = buf.indexOf(STX);
      if (stx === -1) return; // no frame start yet — accumulate

      const etx = buf.indexOf(ETX, stx + 1);
      if (etx === -1) return; // incomplete frame — accumulate
      if (buf.length <= etx + 1) return; // wait for LRC

      try {
        const message = parseApplicationFrame(buf.slice(stx, etx + 2), config);
        console.log('[ECR17] application message:', message);
        if (config.sendAckOnResponse) socket.write(buildConfirmationFrame(ACK, config));
        settle(() => {
          resolve(parsePaymentResponse(message, amountCents));
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
    const frame = buildReversalFrame(config);
    console.log('[ECR17] REVERSAL SEND:', hex(frame));
    socket.write(frame, () => socket.destroy());
  });
  socket.on('error', () => socket.destroy());
}
