import type { OrderState, Payload } from '../types.js';

function base64UrlEncode(s: string): string {
  const b64 = typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
}

export function encodeOrder(order: OrderState, total: number): string {
  const lines = Object.entries(order.lines).filter(([, q]) => q > 0) as [string, number][];
  const payload: Payload = { v: 1, p: order.people, l: lines, t: Math.round(total * 100) };
  return base64UrlEncode(JSON.stringify(payload));
}

export function decodeOrder(s: string): Payload {
  const json = base64UrlDecode(s);
  const obj = JSON.parse(json) as Payload;
  if (obj.v !== 1 || typeof obj.p !== 'number' || !Array.isArray(obj.l)) {
    throw new Error('Payload non valido');
  }
  return obj;
}

export function shortCode(payload: string): string {
  let h = 5381;
  for (let i = 0; i < payload.length; i++) {
    h = ((h << 5) + h + payload.charCodeAt(i)) | 0;
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = Math.abs(h);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return out;
}
