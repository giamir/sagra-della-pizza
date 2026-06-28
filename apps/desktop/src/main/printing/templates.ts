import { EscPos } from './escpos.js';
import { STATION_ORDER, normalizeStation } from './station-constants.js';
import { isAdjKey } from '@sagra/shared/utils/adjustments';

export type PrintLine = {
  itemId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  station: string;
};

export type PrintOrder = {
  id: number | bigint;
  createdAt: string;
  people: number;
  totalCents: number;
  lines: PrintLine[];
};

function eur(cents: number): string {
  return cents < 0 ? `-€${(Math.abs(cents) / 100).toFixed(2)}` : `€${(cents / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tableAndRowLine(width: number): string {
  const row = 'Fila: ______';
  const table = 'Tavolo: ________';
  const gap = Math.max(2, width - row.length - table.length);
  return `${row}${' '.repeat(gap)}${table}`;
}

// One ticket for a single station.
export function buildStationTicket(order: PrintOrder, station: string, lines: PrintLine[], width = 42, copertoStation = 'Bevande'): Buffer {
  const e = new EscPos(width);

  e.init()
    .align('center')
    .line('Sagra della Pizza')
    .line('Orentano')
    .bold(true)
    .doubleSize(true)
    .line(station.toUpperCase())
    .doubleSize(false)
    .line(`ORD #${order.id}`)
    .bold(false)
    .line(formatTime(order.createdAt))
    .feed()
    .line(tableAndRowLine(width))
    .feed()
    .separator('=')
    .align('left');

  e.doubleHeight(true);
  for (const l of lines) {
    if (isAdjKey(l.itemId)) continue; // never print adjustments on prep tickets
    const qtyStr = `${l.qty}x`;
    const maxName = width - qtyStr.length - 2;
    const name = l.name.length > maxName ? l.name.slice(0, maxName - 1) + '…' : l.name;
    e.bold(true).text(`${qtyStr}  `).bold(false).line(name);
  }

  if (normalizeStation(station) === copertoStation && order.people > 0) {
    e.bold(true).text(`${order.people}x  `).bold(false).line('Coperti');
  }
  e.doubleHeight(false);

  e.feed().separator('=').feed(3).cut();
  return e.toBuffer();
}

// Courtesy receipt: full itemised list with prices.
export function buildReceipt(order: PrintOrder, width = 42): Buffer {
  const e = new EscPos(width);
  const copertoTotal = order.people * 150;

  e.init()
    .align('center')
    .bold(true)
    .line('Sagra della Pizza')
    .line('Orentano')
    .line('Copia Cliente')
    .bold(false)
    .separator('=')
    .align('left')
    .line(formatTime(order.createdAt))
    .line(`Ordine #${order.id}`)
    .separator('-');

  for (const l of order.lines) {
    if (isAdjKey(l.itemId)) continue;
    const subtotal = eur(l.unitPriceCents * l.qty);
    const label = `${l.qty}x ${l.name}`;
    e.columns(label, subtotal);
  }

  e.separator('-');
  if (order.people > 0) {
    e.columns(`${order.people} cop. (${eur(150)} cad.)`, eur(copertoTotal));
  }

  for (const l of order.lines) {
    if (!isAdjKey(l.itemId)) continue;
    e.columns(l.name, eur(l.unitPriceCents));
  }

  e.separator('=')
    .bold(true)
    .columns('TOTALE', eur(order.totalCents))
    .bold(false)
    .separator('=')
    .feed()
    .align('center')
    .line("Non e' scontrino fiscale")
    .line('Grazie e buon appetito!')
    .feed(3)
    .cut();

  return e.toBuffer();
}

// Groups order lines by station, in canonical (print) order.
export function groupByStation(lines: PrintLine[], order: string[] = STATION_ORDER): Map<string, PrintLine[]> {
  const map = new Map<string, PrintLine[]>();
  for (const l of lines) {
    if (isAdjKey(l.itemId)) continue; // adjustments are financial, not prep items
    const s = normalizeStation(l.station || 'Altro');
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push(l);
  }
  // Return in canonical order
  const ordered = new Map<string, PrintLine[]>();
  for (const s of order) {
    if (map.has(s)) ordered.set(s, map.get(s)!);
  }
  for (const [s, v] of map) {
    if (!ordered.has(s)) ordered.set(s, v);
  }
  return ordered;
}

// Plain-text preview for each station ticket + receipt.
export function buildPreviewText(
  order: PrintOrder,
  opts: { order?: string[]; copertoStation?: string } = {}
): { stations: { name: string; text: string }[]; receipt: string } {
  const width = 42;
  const copertoStation = opts.copertoStation ?? 'Bevande';
  const sep = (c = '-') => c.repeat(width);
  const byStation = groupByStation(order.lines, opts.order);

  const stations: { name: string; text: string }[] = [];

  for (const [station, lines] of byStation) {
    const rows: string[] = [
      'Sagra della Pizza',
      'Orentano',
      station.toUpperCase(),
      `ORD #${order.id}`,
      formatTime(order.createdAt),
      '',
      tableAndRowLine(width),
      '',
      sep('=')
    ];
    for (const l of lines) {
      rows.push(`${l.qty}x  ${l.name}`);
    }
    if (normalizeStation(station) === copertoStation && order.people > 0) {
      rows.push(`${order.people}x  Coperti`);
    }
    rows.push('', sep('='));
    stations.push({ name: station, text: rows.join('\n') });
  }

  const copertoTotal = order.people * 150;
  const receiptRows: string[] = ['Sagra della Pizza', 'Orentano', 'Copia Cliente', sep('='), formatTime(order.createdAt), `Ordine #${order.id}`, sep('-')];
  for (const l of order.lines) {
    if (isAdjKey(l.itemId)) continue;
    const label = `${l.qty}x ${l.name}`;
    const sub = eur(l.unitPriceCents * l.qty);
    const gap = Math.max(1, width - label.length - sub.length);
    receiptRows.push(`${label}${' '.repeat(gap)}${sub}`);
  }
  receiptRows.push(sep('-'));
  const copStr = eur(copertoTotal);
  const copLabel = `${order.people} coperti`;
  receiptRows.push(`${copLabel}${' '.repeat(Math.max(1, width - copLabel.length - copStr.length))}${copStr}`);
  for (const l of order.lines) {
    if (!isAdjKey(l.itemId)) continue;
    const sub = eur(l.unitPriceCents);
    receiptRows.push(`${l.name}${' '.repeat(Math.max(1, width - l.name.length - sub.length))}${sub}`);
  }
  receiptRows.push(sep('='));
  const totStr = eur(order.totalCents);
  receiptRows.push(`TOTALE${' '.repeat(Math.max(1, width - 6 - totStr.length))}${totStr}`, sep('='), '', "Non e' scontrino fiscale", 'Grazie e buon appetito!');

  return { stations, receipt: receiptRows.join('\n') };
}
