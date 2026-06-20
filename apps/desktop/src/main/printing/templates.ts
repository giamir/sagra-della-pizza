import { EscPos } from './escpos.js';
import { STATION_ORDER, normalizeStation } from './station-map.js';

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
  return `€${(cents / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tableAndRowLine(width: number): string {
  const table = 'Tavolo: ________';
  const row = 'Fila: ______';
  const gap = Math.max(2, width - table.length - row.length);
  return `${table}${' '.repeat(gap)}${row}`;
}

// One ticket for a single station.
export function buildStationTicket(order: PrintOrder, station: string, lines: PrintLine[], width = 42): Buffer {
  const e = new EscPos(width);

  e.init()
    .align('center')
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

  for (const l of lines) {
    const qtyStr = `${l.qty}x`;
    const maxName = width - qtyStr.length - 2;
    const name = l.name.length > maxName ? l.name.slice(0, maxName - 1) + '…' : l.name;
    e.bold(true).text(`${qtyStr}  `).bold(false).line(name);
  }

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
    .line('Copia Cliente')
    .bold(false)
    .separator('=')
    .align('left')
    .line(formatTime(order.createdAt))
    .line(`Ordine #${order.id}`)
    .separator('-');

  for (const l of order.lines) {
    const subtotal = eur(l.unitPriceCents * l.qty);
    const label = `${l.qty}x ${l.name}`;
    e.columns(label, subtotal);
  }

  e.separator('-');
  if (order.people > 0) {
    e.columns(`${order.people} cop. (${eur(150)} cad.)`, eur(copertoTotal));
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

// Groups order lines by station, in canonical order.
export function groupByStation(lines: PrintLine[]): Map<string, PrintLine[]> {
  const map = new Map<string, PrintLine[]>();
  for (const l of lines) {
    const s = normalizeStation(l.station || 'Altro');
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push(l);
  }
  // Return in canonical order
  const ordered = new Map<string, PrintLine[]>();
  for (const s of STATION_ORDER) {
    if (map.has(s)) ordered.set(s, map.get(s)!);
  }
  for (const [s, v] of map) {
    if (!ordered.has(s)) ordered.set(s, v);
  }
  return ordered;
}

// Plain-text preview for each station ticket + receipt.
export function buildPreviewText(order: PrintOrder): { stations: { name: string; text: string }[]; receipt: string } {
  const width = 42;
  const sep = (c = '-') => c.repeat(width);
  const byStation = groupByStation(order.lines);

  const stations: { name: string; text: string }[] = [];

  for (const [station, lines] of byStation) {
    const rows: string[] = [
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
    rows.push('', sep('='));
    stations.push({ name: station, text: rows.join('\n') });
  }

  const copertoTotal = order.people * 150;
  const receiptRows: string[] = ['Sagra della Pizza', 'Copia Cliente', sep('='), formatTime(order.createdAt), `Ordine #${order.id}`, sep('-')];
  for (const l of order.lines) {
    const label = `${l.qty}x ${l.name}`;
    const sub = eur(l.unitPriceCents * l.qty);
    const gap = Math.max(1, width - label.length - sub.length);
    receiptRows.push(`${label}${' '.repeat(gap)}${sub}`);
  }
  receiptRows.push(sep('-'));
  const copStr = eur(copertoTotal);
  const copLabel = `${order.people} coperti`;
  receiptRows.push(`${copLabel}${' '.repeat(Math.max(1, width - copLabel.length - copStr.length))}${copStr}`);
  receiptRows.push(sep('='));
  const totStr = eur(order.totalCents);
  receiptRows.push(`TOTALE${' '.repeat(Math.max(1, width - 6 - totStr.length))}${totStr}`, sep('='), '', "Non e' scontrino fiscale", 'Grazie e buon appetito!');

  return { stations, receipt: receiptRows.join('\n') };
}
