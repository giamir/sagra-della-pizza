<script lang="ts">
  import { onMount } from 'svelte';
  import { formatEUR } from '@sagra/shared/utils/currency';
  import { isAdjKey } from '@sagra/shared/utils/adjustments';
  import { STATION_ORDER, normalizeStation } from '$lib/station-order';
  import PrintPreview from './PrintPreview.svelte';

  type ReportLine = { itemId: string; name: string; qty: number; unitPriceCents: number; station: string };
  type ReportOrder = {
    id: string; tillName: string; createdAt: string; people: number;
    totalCents: number; source: 'qr' | 'manual'; paymentMethod: 'cash' | 'card';
    lines: ReportLine[];
  };
  type TrendBucket = {
    key: string;
    label: string;
    rangeLabel: string;
    orders: number;
    cents: number;
    pct: number;
    revenuePct: number;
  };
  type TillSummary = {
    tillName: string;
    orders: number;
    covers: number;
    totalCents: number;
    cashCents: number;
    cardCents: number;
    cashOrders: number;
    cardOrders: number;
  };

  let {
    onClose,
    onReloadCart,
  }: {
    onClose: () => void;
    onReloadCart: (lines: { id: string; qty: number }[], people: number) => void;
  } = $props();

  type Period = 'hour' | 'today' | 'date' | 'all';
  const PERIODS: { key: Period; label: string }[] = [
    { key: 'hour',  label: 'Ultima ora' },
    { key: 'today', label: 'Oggi' },
    { key: 'all',   label: 'Tutto' },
  ];
  const TABS: { key: 'summary' | 'items' | 'orders'; label: string }[] = [
    { key: 'summary', label: 'Riepilogo' },
    { key: 'items',   label: 'Articoli' },
    { key: 'orders',  label: 'Ordini' },
  ];
  let period = $state<Period>('today');
  // YYYY-MM-DD strings; when either is set, the range overrides the period quick-filter.
  // Setting only one yields a single day (from === to).
  let fromDate = $state('');
  let toDate = $state('');
  // When set, scopes the whole report to a single till (matches a tillKey()). '' = all tills.
  let tillFilter = $state('');
  let tab = $state<'summary' | 'items' | 'orders'>('summary');
  let orders = $state<ReportOrder[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let expandedId = $state<string | null>(null);
  let voidingId = $state<string | null>(null);
  let voidError = $state<string | null>(null);
  let printingId = $state<string | null>(null);
  let printError = $state<{ id: string; message: string } | null>(null);
  let printSuccessId = $state<string | null>(null);
  let printPreview = $state<{ stations: { name: string; text: string }[]; receipt: string; error: string } | null>(null);

  // Normalized till identity, shared between byTill grouping and the till dropdown so
  // the filter value can never drift from the grouping key.
  function tillKey(o: { tillName: string }): string {
    return o.tillName?.trim() || 'Cassa senza nome';
  }

  // A custom range is active when either date input is set; it overrides the quick period.
  const rangeActive = $derived(!!(fromDate || toDate));
  // Effective bounds: a single date (only Da or only A) collapses to one day; swap if inverted.
  const effectiveRange = $derived.by((): { from: string; to: string } | null => {
    if (!rangeActive) return null;
    let from = fromDate || toDate;
    let to = toDate || fromDate;
    if (from > to) [from, to] = [to, from];
    return { from, to };
  });
  const isSingleDay = $derived(effectiveRange != null && effectiveRange.from === effectiveRange.to);

  function fmtDayLabel(ymd: string): string {
    return new Date(ymd + 'T00:00:00').toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
  }
  function fmtDayShort(ymd: string): string {
    return new Date(ymd + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  }

  // Label shown above the orders list to tell the user what range is active
  const rangeLabel = $derived.by(() => {
    let base: string;
    if (effectiveRange) {
      base = isSingleDay
        ? fmtDayLabel(effectiveRange.from)
        : `${fmtDayShort(effectiveRange.from)} – ${fmtDayShort(effectiveRange.to)}`;
    } else if (period === 'hour') base = 'Ultima ora';
    else if (period === 'today') base = 'Oggi';
    else base = 'Tutti i giorni';
    return tillFilter ? `${base} · ${tillFilter}` : base;
  });

  async function handleVoid(order: ReportOrder, reload: boolean) {
    voidingId = order.id;
    voidError = null;
    try {
      const result = await window.api.voidOrder(order.id);
      if (!result.ok) { voidError = result.error ?? 'Errore'; return; }
      // Remove from local list immediately
      orders = orders.filter((o) => o.id !== order.id);
      expandedId = null;
      if (reload) {
        const cartLines = order.lines.map((l) => ({ id: l.itemId, qty: l.qty }));
        onReloadCart(cartLines, order.people);
        onClose();
      }
    } catch (e) {
      voidError = e instanceof Error ? e.message : 'Errore';
    } finally {
      voidingId = null;
    }
  }

  async function handleReprint(order: ReportOrder) {
    printingId = order.id;
    printError = null;
    printSuccessId = null;
    try {
      const orderId = Number(order.id);
      if (!Number.isSafeInteger(orderId)) throw new Error(`ID ordine non valido: ${order.id}`);

      const result = await window.api.printOrder(orderId);
      if (result.ok) {
        printSuccessId = order.id;
        return;
      }
      const errorMessage = result.error ?? 'Errore stampa';
      if (result.preview) {
        printPreview = {
          stations: result.preview.stations,
          receipt: result.preview.receipt,
          error: errorMessage
        };
      }
      printError = { id: order.id, message: errorMessage };
    } catch (e) {
      printError = { id: order.id, message: e instanceof Error ? e.message : 'Errore stampa' };
    } finally {
      printingId = null;
    }
  }

  function activeRange(): [string, string] {
    // Custom from/to range takes priority over the quick period buttons.
    if (effectiveRange) {
      const from = new Date(effectiveRange.from + 'T00:00:00').toISOString();
      const to   = new Date(effectiveRange.to + 'T23:59:59.999').toISOString();
      return [from, to];
    }
    const now = new Date();
    const to = now.toISOString();
    if (period === 'hour') {
      return [new Date(now.getTime() - 60 * 60 * 1000).toISOString(), to];
    }
    if (period === 'today') {
      return [new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to];
    }
    return ['1970-01-01T00:00:00.000Z', to];
  }

  async function load() {
    loading = true;
    error = null;
    const [from, to] = activeRange();
    try {
      const result = await window.api.getReports(from, to);
      if (!result.ok) { error = result.error; orders = []; }
      else {
        orders = result.orders;
        // Drop a till filter that has no orders in the freshly loaded range so the
        // UI never gets stuck on an empty selection.
        if (tillFilter && !orders.some((o) => tillKey(o) === tillFilter)) tillFilter = '';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Errore';
      orders = [];
    } finally {
      loading = false;
    }
  }

  onMount(load);
  $effect(() => { period; fromDate; toDate; load(); });

  // Tills present in the loaded (unfiltered) range — drives the dropdown so it never
  // collapses to a single entry once a filter is applied.
  const availableTills = $derived.by(() => {
    const set = new Set<string>();
    for (const o of orders) set.add(tillKey(o));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'it'));
  });

  // Every aggregation below works off the till-scoped set; raw `orders` is only used
  // for `availableTills` above.
  const filteredOrders = $derived(
    tillFilter ? orders.filter((o) => tillKey(o) === tillFilter) : orders
  );

  // --- Summary computations ---
  const totalRevenue   = $derived(filteredOrders.reduce((s, o) => s + o.totalCents, 0));
  const totalCovers    = $derived(filteredOrders.reduce((s, o) => s + o.people, 0));
  const cashRevenue    = $derived(filteredOrders.reduce((s, o) => s + (o.paymentMethod === 'cash' ? o.totalCents : 0), 0));
  const cardRevenue    = $derived(filteredOrders.reduce((s, o) => s + (o.paymentMethod === 'card' ? o.totalCents : 0), 0));

  // --- Cash float (fondo cassa) per till ---
  // Editable euro strings keyed by till name; cents are derived on the fly.
  let cashByTill = $state<Record<string, { fondo: string; counted: string }>>({});
  let cashError = $state<string | null>(null);

  function localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // The single day the closing applies to, or null for multi-day views ("Tutto" / range).
  const businessDate = $derived.by((): string | null => {
    if (effectiveRange) return isSingleDay ? effectiveRange.from : null;
    if (period === 'all') return null;
    return localDateKey(new Date());
  });

  function parseEuro(s: string): number {
    const cleaned = s.replace(/[^0-9.,-]/g, '').replace(',', '.');
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  function centsToInput(cents: number | null): string {
    if (cents == null) return '';
    return (cents / 100).toFixed(2).replace('.', ',');
  }
  function fondoCentsOf(till: string): number {
    return parseEuro(cashByTill[till]?.fondo ?? '');
  }

  // Banknote denominations (euro), largest first; coins are entered as a single lump.
  const NOTE_DENOMS = [500, 200, 100, 50, 20, 10, 5];
  // Session-only count per till: how many of each note + a coins euro string. Not
  // persisted (we store only the computed total), so it's empty when reopening a closing.
  let denomCounts = $state<Record<string, { notes: Record<number, string>; coins: string }>>({});

  function denomEntry(till: string): { notes: Record<number, string>; coins: string } {
    return denomCounts[till] ?? { notes: {}, coins: '' };
  }
  function noteQty(till: string, denom: number): number {
    const n = Number.parseInt(denomEntry(till).notes[denom] ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function noteSubtotalCents(till: string, denom: number): number {
    return noteQty(till, denom) * denom * 100;
  }
  function coinsCentsOf(till: string): number {
    return parseEuro(denomEntry(till).coins);
  }
  function hasDenomInput(till: string): boolean {
    const e = denomEntry(till);
    return e.coins.trim() !== '' || NOTE_DENOMS.some((d) => (e.notes[d] ?? '').trim() !== '');
  }
  // Counted cash built from the note/coin breakdown.
  function denomCountedCents(till: string): number {
    let cents = coinsCentsOf(till);
    for (const d of NOTE_DENOMS) cents += noteSubtotalCents(till, d);
    return cents;
  }
  // Effective counted cash used for the difference and for persistence: the live
  // breakdown when the operator has entered any note/coin, otherwise the saved total
  // (so reopening a previously closed till still shows its figure).
  function countedCentsOf(till: string): number | null {
    if (hasDenomInput(till)) return denomCountedCents(till);
    const c = cashByTill[till]?.counted ?? '';
    return c.trim() === '' ? null : parseEuro(c);
  }

  function updateCashField(till: string, field: 'fondo' | 'counted', value: string) {
    const cur = cashByTill[till] ?? { fondo: '', counted: '' };
    cashByTill = { ...cashByTill, [till]: { ...cur, [field]: value } };
  }
  function updateNote(till: string, denom: number, value: string) {
    const e = denomEntry(till);
    denomCounts = { ...denomCounts, [till]: { ...e, notes: { ...e.notes, [denom]: value } } };
  }
  function updateCoins(till: string, value: string) {
    const e = denomEntry(till);
    denomCounts = { ...denomCounts, [till]: { ...e, coins: value } };
  }

  async function loadCash() {
    const date = businessDate;
    if (!date) { cashByTill = {}; return; }
    try {
      const result = await window.api.getCashFloats(date);
      if (!result.ok) { cashError = result.error ?? 'Errore'; return; }
      const map: Record<string, { fondo: string; counted: string }> = {};
      for (const f of result.floats) {
        map[f.tillName] = { fondo: centsToInput(f.fondoCents), counted: centsToInput(f.countedCents) };
      }
      cashByTill = map;
      cashError = null;
    } catch (e) {
      cashError = e instanceof Error ? e.message : 'Errore';
    }
  }

  async function saveCash(till: string) {
    const date = businessDate;
    if (!date) return;
    const fondoCents = fondoCentsOf(till);
    const countedCents = countedCentsOf(till);
    // Normalize the displayed values once persisted.
    cashByTill = {
      ...cashByTill,
      [till]: {
        fondo: fondoCents ? centsToInput(fondoCents) : '',
        counted: countedCents == null ? '' : centsToInput(countedCents)
      }
    };
    try {
      const result = await window.api.setCashFloat(till, date, fondoCents, countedCents);
      cashError = result.ok ? null : (result.error ?? 'Errore salvataggio');
    } catch (e) {
      cashError = e instanceof Error ? e.message : 'Errore salvataggio';
    }
  }

  // Reload the fondo values whenever the active day changes.
  $effect(() => { businessDate; loadCash(); });

  const byTill = $derived.by((): TillSummary[] => {
    const map = new Map<string, TillSummary>();
    for (const o of filteredOrders) {
      const key = tillKey(o);
      const cur = map.get(key) ?? {
        tillName: key,
        orders: 0,
        covers: 0,
        totalCents: 0,
        cashCents: 0,
        cardCents: 0,
        cashOrders: 0,
        cardOrders: 0
      };
      cur.orders += 1;
      cur.covers += o.people;
      cur.totalCents += o.totalCents;
      if (o.paymentMethod === 'card') {
        cur.cardCents += o.totalCents;
        cur.cardOrders += 1;
      } else {
        cur.cashCents += o.totalCents;
        cur.cashOrders += 1;
      }
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) =>
      b.totalCents - a.totalCents ||
      b.orders - a.orders ||
      a.tillName.localeCompare(b.tillName, 'it')
    );
  });

  const byStation = $derived.by(() => {
    const map = new Map<string, { qty: number; cents: number }>();
    for (const o of filteredOrders) {
      for (const l of o.lines) {
        if (isAdjKey(l.itemId)) continue;
        const key = normalizeStation(l.station || 'Altro');
        const cur = map.get(key) ?? { qty: 0, cents: 0 };
        cur.qty += l.qty;
        cur.cents += l.qty * l.unitPriceCents;
        map.set(key, cur);
      }
    }
    return STATION_ORDER
      .filter((s) => map.has(s))
      .map((s) => ({ station: s, ...map.get(s)! }))
      .concat(
        Array.from(map.entries())
          .filter(([s]) => !STATION_ORDER.includes(s))
          .map(([s, v]) => ({ station: s, ...v }))
      );
  });

  const soldItems = $derived.by(() => {
    const map = new Map<string, { itemId: string; name: string; qty: number; cents: number; unitPriceCents: number; station: string }>();
    for (const o of filteredOrders) {
      for (const l of o.lines) {
        if (isAdjKey(l.itemId)) continue;
        const cur = map.get(l.itemId) ?? {
          itemId: l.itemId,
          name: l.name,
          qty: 0,
          cents: 0,
          unitPriceCents: l.unitPriceCents,
          station: normalizeStation(l.station || 'Altro')
        };
        cur.qty += l.qty;
        cur.cents += l.qty * l.unitPriceCents;
        map.set(l.itemId, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      b.qty - a.qty ||
      b.cents - a.cents ||
      a.name.localeCompare(b.name, 'it')
    );
  });
  const topItems = $derived(soldItems.slice(0, 10));
  const soldItemsTotalQty = $derived(soldItems.reduce((sum, item) => sum + item.qty, 0));

  const orderTrend = $derived.by((): TrendBucket[] => {
    if (period === 'hour' && !rangeActive) {
      const to = new Date();
      to.setSeconds(0, 0);
      const from = new Date(to.getTime() - 60 * 60 * 1000);
      const buckets: TrendBucket[] = [];
      for (let i = 0; i < 6; i++) {
        const start = new Date(from.getTime() + i * 10 * 60 * 1000);
        const end = new Date(start.getTime() + 10 * 60 * 1000);
        buckets.push({
          key: start.toISOString(),
          label: start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
          rangeLabel: `${start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}-${end.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`,
          orders: 0,
          cents: 0,
          pct: 0,
          revenuePct: 0
        });
      }
      for (const o of filteredOrders) {
        const createdAt = new Date(o.createdAt);
        const index = Math.floor((createdAt.getTime() - from.getTime()) / (10 * 60 * 1000));
        if (index < 0 || index >= buckets.length) continue;
        buckets[index].orders++;
        buckets[index].cents += o.totalCents;
      }
      const maxOrders = Math.max(1, ...buckets.map((b) => b.orders));
      const maxRevenue = Math.max(1, ...buckets.map((b) => b.cents));
      return buckets.map((b) => ({
        ...b,
        pct: Math.round((b.orders / maxOrders) * 100),
        revenuePct: Math.round((b.cents / maxRevenue) * 100)
      }));
    }

    const map = new Map<number, { orders: number; cents: number }>();
    for (const o of filteredOrders) {
      const h = new Date(o.createdAt).getHours();
      const cur = map.get(h) ?? { orders: 0, cents: 0 };
      cur.orders++;
      cur.cents += o.totalCents;
      map.set(h, cur);
    }
    const hours = rangeActive || period === 'all'
      ? Array.from({ length: 24 }, (_, i) => i)
      : Array.from({ length: new Date().getHours() + 1 }, (_, i) => i);
    const maxOrders = Math.max(1, ...hours.map((h) => map.get(h)?.orders ?? 0));
    const maxRevenue = Math.max(1, ...hours.map((h) => map.get(h)?.cents ?? 0));
    return hours.map((h) => {
      const v = map.get(h) ?? { orders: 0, cents: 0 };
      const label = String(h).padStart(2, '0');
      return {
        key: label,
        label,
        rangeLabel: `${label}:00-${String((h + 1) % 24).padStart(2, '0')}:00`,
        ...v,
        pct: Math.round((v.orders / maxOrders) * 100),
        revenuePct: Math.round((v.cents / maxRevenue) * 100)
      };
    });
  });

  const trendSummary = $derived.by(() => {
    const active = orderTrend.filter((b) => b.orders > 0);
    const peak = [...active].sort((a, b) => b.orders - a.orders || b.cents - a.cents)[0] ?? null;
    const totalTrendRevenue = active.reduce((sum, b) => sum + b.cents, 0);
    const totalTrendOrders = active.reduce((sum, b) => sum + b.orders, 0);
    return {
      peak,
      averageOrders: active.length ? totalTrendOrders / active.length : 0,
      averageTicketCents: totalTrendOrders ? Math.round(totalTrendRevenue / totalTrendOrders) : 0
    };
  });

  const topTrendBuckets = $derived(
    [...orderTrend]
      .filter((bucket) => bucket.orders > 0)
      .sort((a, b) => b.orders - a.orders || b.cents - a.cents)
      .slice(0, 5)
  );

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  }

  function csvCell(value: string | number): string {
    const text = String(value).replaceAll('"', '""');
    return `"${text}"`;
  }

  function csvEuro(cents: number): string {
    return (cents / 100).toFixed(2).replace('.', ',');
  }

  function htmlEscape(value: string | number): string {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function slugifyTill(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function exportRangeKey(): string {
    let key: string;
    if (effectiveRange) {
      key = isSingleDay ? effectiveRange.from : `${effectiveRange.from}_${effectiveRange.to}`;
    } else if (period === 'today') key = new Date().toISOString().slice(0, 10);
    else if (period === 'hour') key = `ultima-ora-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    else key = 'tutto';
    return tillFilter ? `${key}-${slugifyTill(tillFilter)}` : key;
  }

  function exportSoldItemsCsv() {
    const rows = [
      ['item_id', 'articolo', 'stazione', 'quantita', 'prezzo_eur', 'incasso_eur'],
      ...soldItems.map((item) => [
        item.itemId,
        item.name,
        item.station,
        item.qty,
        csvEuro(item.unitPriceCents),
        csvEuro(item.cents)
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `articoli-venduti-${exportRangeKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportSoldItemsExcel() {
    const generatedAt = new Date().toLocaleString('it-IT');
    const headers = ['ID articolo', 'Articolo', 'Stazione', 'Quantita', 'Prezzo', 'Incasso'];
    const moneyColumns = [4, 5];
    const bodyRows = soldItems.map((item) => [
      item.itemId,
      item.name,
      item.station,
      item.qty,
      item.unitPriceCents,
      item.cents
    ]);

    const headerCells = headers
      .map((h, index) => `<th${moneyColumns.includes(index) ? ' style="text-align:right;"' : ''}>${htmlEscape(h)}</th>`)
      .join('');
    const bodyHtml = bodyRows
      .map((row) => {
        const cells = row
          .map((cell, index) => {
            if (moneyColumns.includes(index) && typeof cell === 'number') {
              // Raw dot-decimal value so Excel parses it as a real number,
              // then formats it as currency regardless of system locale.
              return `<td style="mso-number-format:'0.00';text-align:right;">${(cell / 100).toFixed(2)}</td>`;
            }
            return `<td>${htmlEscape(cell)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    const html = `<!doctype html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" lang="it">
        <head>
          <meta charset="utf-8" />
          <!--[if gte mso 9]>
          <xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>Articoli venduti</x:Name>
                  <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml>
          <![endif]-->
          <style>
            body { font-family: Arial, sans-serif; }
            h1 { color: #14532d; }
            p { color: #4b5563; }
            table { border-collapse: collapse; margin-bottom: 18px; }
            th { background: #e5e7eb; font-weight: bold; text-align: left; }
            th, td { border: 1px solid #9ca3af; padding: 6px 8px; }
          </style>
        </head>
        <body>
          <h1>Articoli venduti - ${htmlEscape(rangeLabel)}</h1>
          <p>Generato ${htmlEscape(generatedAt)} \u00B7 ${soldItems.length} articoli \u00B7 ${soldItemsTotalQty} pezzi</p>
          <table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </body>
      </html>`;

    const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `articoli-venduti-${exportRangeKey()}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportSoldItemsPdf() {
    const generatedAt = new Date().toLocaleString('it-IT');
    const rows = soldItems.map((item) => `
      <tr>
        <td>
          <strong>${htmlEscape(item.name)}</strong>
        </td>
        <td>${htmlEscape(item.station)}</td>
        <td class="num qty">${item.qty}</td>
        <td class="num">${formatEUR(item.unitPriceCents / 100)}</td>
        <td class="num total">${formatEUR(item.cents / 100)}</td>
      </tr>
    `).join('');
    const html = `<!doctype html>
      <html lang="it">
        <head>
          <meta charset="utf-8" />
          <title>Articoli venduti - ${htmlEscape(rangeLabel)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #14532d; padding-bottom: 14px; margin-bottom: 18px; }
            h1 { margin: 0; color: #14532d; font-size: 24px; }
            p { margin: 4px 0 0; color: #4b5563; font-size: 12px; }
            .kpis { display: flex; gap: 10px; margin-bottom: 18px; }
            .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; min-width: 120px; }
            .kpi span { display: block; color: #6b7280; font-size: 11px; font-weight: 700; text-transform: uppercase; }
            .kpi strong { display: block; margin-top: 4px; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { text-align: left; background: #f3f4f6; color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
            tbody tr:nth-child(even) { background: #f9fafb; }
            .num { text-align: right; white-space: nowrap; }
            .qty { font-weight: 800; font-size: 14px; }
            .total { color: #166534; font-weight: 800; }
            @page { margin: 14mm; }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>Articoli venduti</h1>
              <p>${htmlEscape(rangeLabel)} · generato ${htmlEscape(generatedAt)}</p>
            </div>
            <div>
              <p>${filteredOrders.length} ordini · ${totalCovers} coperti</p>
              <p>${formatEUR(totalRevenue / 100)} incasso totale</p>
            </div>
          </header>
          <section class="kpis">
            <div class="kpi"><span>Articoli diversi</span><strong>${soldItems.length}</strong></div>
            <div class="kpi"><span>Pezzi totali</span><strong>${soldItemsTotalQty}</strong></div>
          </section>
          <table>
            <thead>
              <tr>
                <th>Articolo</th>
                <th>Stazione</th>
                <th class="num">Qtà</th>
                <th class="num">Prezzo</th>
                <th class="num">Incasso</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>`;

    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    };
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Rapporti"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-white dark:bg-[#20242c] flex flex-col"
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="flex flex-col flex-1 overflow-hidden">

    <!-- App bar -->
    <div class="shrink-0 h-12 bg-green-900 text-white flex flex-wrap items-center gap-2 px-4">
      <button type="button" onclick={onClose} class="text-green-200 hover:text-white font-bold text-sm mr-1">← Cassa</button>
      <span class="font-bold tracking-wide text-sm uppercase">Rapporti</span>
        <!-- Quick period buttons -->
        <div class="flex rounded-lg overflow-hidden border border-white/30 text-xs font-semibold"
          class:opacity-40={rangeActive}
        >
          {#each PERIODS as p}
            <button
              type="button"
              onclick={() => { fromDate = ''; toDate = ''; period = p.key; }}
              disabled={rangeActive}
              class="px-3 py-1.5 transition-colors"
              class:bg-white={period === p.key && !rangeActive}
              class:text-[#14532d]={period === p.key && !rangeActive}
              class:text-white={period !== p.key || rangeActive}
              class:opacity-60={period !== p.key}
            >{p.label}</button>
          {/each}
        </div>

        <!-- Da / A date range -->
        <div class="flex items-center gap-1 text-xs">
          <label class="flex items-center gap-1">
            <span class="text-white/60">Da</span>
            <input
              type="date"
              bind:value={fromDate}
              max={toDate || undefined}
              class="rounded px-2 py-1 bg-transparent text-white focus:outline-none focus:ring-1 focus:ring-white border {fromDate ? 'border-white' : 'border-white/30'}"
              title="Inizio periodo"
            />
          </label>
          <label class="flex items-center gap-1">
            <span class="text-white/60">A</span>
            <input
              type="date"
              bind:value={toDate}
              min={fromDate || undefined}
              class="rounded px-2 py-1 bg-transparent text-white focus:outline-none focus:ring-1 focus:ring-white border {toDate ? 'border-white' : 'border-white/30'}"
              title="Fine periodo"
            />
          </label>
          {#if rangeActive}
            <button type="button" onclick={() => { fromDate = ''; toDate = ''; }} class="text-white/60 hover:text-white px-1" title="Rimuovi filtro periodo">✕</button>
          {/if}
        </div>

        <!-- Till filter -->
        {#if availableTills.length > 1 || tillFilter}
          <select
            bind:value={tillFilter}
            class="rounded px-2 py-1 text-xs bg-green-900 text-white focus:outline-none focus:ring-1 focus:ring-white border {tillFilter ? 'border-white' : 'border-white/30'}"
            title="Filtra per cassa"
          >
            <option value="">Tutte le casse</option>
            {#each availableTills as till}
              <option value={till}>{till}</option>
            {/each}
          </select>
        {/if}

        <button type="button" onclick={load} class="ml-auto text-white/60 hover:text-white text-lg" title="Aggiorna">↻</button>
    </div>

    <!-- Tabs + active range label -->
    <div class="shrink-0 flex items-center justify-between px-6 border-b border-gray-200">
      <div class="flex">
        {#each TABS as t}
          <button
            type="button"
            onclick={() => tab = t.key}
            class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
            class:border-green-700={tab === t.key}
            class:text-green-900={tab === t.key}
            class:border-transparent={tab !== t.key}
            class:text-gray-500={tab !== t.key}
          >{t.label}</button>
        {/each}
      </div>
      <span class="text-xs text-gray-400 italic capitalize">{rangeLabel}</span>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto">
      {#if loading}
        <div class="flex items-center justify-center h-40 text-gray-400">Caricamento…</div>
      {:else if error}
        <div class="flex items-center justify-center h-40 text-red-500">{error}</div>
      {:else if filteredOrders.length === 0}
        <div class="flex items-center justify-center h-40 text-gray-400">
          {tillFilter
            ? `Nessun ordine per ${tillFilter} nel periodo selezionato`
            : 'Nessun ordine nel periodo selezionato'}
        </div>
      {:else if tab === 'summary'}

        <!-- KPI row -->
        <div class="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div class="bg-green-50 rounded-xl p-4 text-center">
            <p class="text-2xl font-bold text-green-900">{formatEUR(totalRevenue / 100)}</p>
            <p class="text-xs text-green-700 mt-1 font-medium">Incasso totale</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center">
            <p class="text-2xl font-bold text-gray-800">{filteredOrders.length}</p>
            <p class="text-xs text-gray-500 mt-1 font-medium">Ordini</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center">
            <p class="text-2xl font-bold text-gray-800">{totalCovers}</p>
            <p class="text-xs text-gray-500 mt-1 font-medium">Coperti</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center">
            <p class="text-lg font-bold text-gray-800">
              <span class="text-gray-600">💵 {formatEUR(cashRevenue / 100)}</span>
              <span class="mx-1 text-gray-300">·</span>
              <span class="text-blue-700">💳 {formatEUR(cardRevenue / 100)}</span>
            </p>
            <p class="text-xs text-gray-500 mt-1 font-medium">Contanti / Carta</p>
          </div>
        </div>

        <!-- Cash closing (fondo cassa per till) -->
        {#if businessDate}
          <div class="px-4 pb-2">
            <div class="border border-gray-100 rounded-xl overflow-hidden">
              <div class="flex items-center justify-between bg-gray-50 px-4 py-2">
                <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Chiusura cassa</p>
                {#if cashError}
                  <p class="text-xs text-red-600">{cashError}</p>
                {:else}
                  <p class="text-xs text-gray-400">Fondo cassa + contanti = atteso in cassa</p>
                {/if}
              </div>
              {#if byTill.length === 0}
                <p class="px-4 py-6 text-center text-sm text-gray-400">Nessuna cassa con ordini in questo giorno</p>
              {:else}
                <div class="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {#each byTill as row}
                    {@const expected = fondoCentsOf(row.tillName) + row.cashCents}
                    {@const counted = countedCentsOf(row.tillName)}
                    {@const diff = counted == null ? null : counted - expected}
                    <div class="rounded-xl border border-gray-200 p-4">
                      <p class="mb-3 font-bold text-gray-800">{row.tillName}</p>
                      <div class="space-y-2 text-sm">
                        <label class="flex items-center justify-between gap-2">
                          <span class="text-gray-500">Fondo cassa</span>
                          <span class="relative">
                            <span class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                            <input
                              inputmode="decimal"
                              value={cashByTill[row.tillName]?.fondo ?? ''}
                              oninput={(e) => updateCashField(row.tillName, 'fondo', e.currentTarget.value)}
                              onblur={() => saveCash(row.tillName)}
                              placeholder="0,00"
                              class="w-24 rounded border border-gray-300 py-1 pl-5 pr-2 text-right tabular-nums focus:border-green-600 focus:outline-none"
                            />
                          </span>
                        </label>
                        <div class="flex items-center justify-between text-gray-600">
                          <span>+ Incasso contanti</span>
                          <span class="tabular-nums">{formatEUR(row.cashCents / 100)}</span>
                        </div>
                        <div class="flex items-center justify-between border-t border-gray-200 pt-2">
                          <span class="font-semibold text-gray-700">= Attesi in cassa</span>
                          <span class="text-lg font-black tabular-nums text-green-800">{formatEUR(expected / 100)}</span>
                        </div>

                        <!-- Card takings: informational, never in the cash drawer -->
                        <div class="flex items-center justify-between text-gray-400">
                          <span>Incasso carta <span class="text-[10px] uppercase tracking-wide">(non in cassa)</span></span>
                          <span class="tabular-nums text-blue-600">{formatEUR(row.cardCents / 100)}</span>
                        </div>
                        <div class="flex items-center justify-between text-gray-500">
                          <span>Totale incassato</span>
                          <span class="tabular-nums">{formatEUR((row.cashCents + row.cardCents) / 100)}</span>
                        </div>

                        <!-- Cash count by banknote denomination + coins lump -->
                        <div class="border-t border-gray-200 pt-2">
                          <p class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Conteggio contanti</p>
                          <div class="space-y-1">
                            {#each NOTE_DENOMS as note}
                              <div class="flex items-center gap-2">
                                <span class="w-10 text-gray-500 tabular-nums">€{note}</span>
                                <span class="text-gray-300">×</span>
                                <input
                                  inputmode="numeric"
                                  value={denomEntry(row.tillName).notes[note] ?? ''}
                                  oninput={(e) => updateNote(row.tillName, note, e.currentTarget.value)}
                                  onblur={() => saveCash(row.tillName)}
                                  placeholder="0"
                                  class="w-14 rounded border border-gray-300 py-0.5 px-2 text-right tabular-nums focus:border-green-600 focus:outline-none"
                                />
                                <span class="ml-auto w-20 text-right tabular-nums text-gray-400">{noteQty(row.tillName, note) ? formatEUR(noteSubtotalCents(row.tillName, note) / 100) : '—'}</span>
                              </div>
                            {/each}
                            <label class="flex items-center gap-2">
                              <span class="w-10 text-gray-500">Monete</span>
                              <span class="text-transparent">×</span>
                              <span class="relative">
                                <span class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                                <input
                                  inputmode="decimal"
                                  value={denomEntry(row.tillName).coins}
                                  oninput={(e) => updateCoins(row.tillName, e.currentTarget.value)}
                                  onblur={() => saveCash(row.tillName)}
                                  placeholder="0,00"
                                  class="w-14 rounded border border-gray-300 py-0.5 pl-5 pr-1 text-right tabular-nums focus:border-green-600 focus:outline-none"
                                />
                              </span>
                              <span class="ml-auto w-20"></span>
                            </label>
                          </div>
                        </div>

                        <div class="flex items-center justify-between border-t border-gray-200 pt-2">
                          <span class="text-gray-500">Contanti contati</span>
                          <span class="font-bold tabular-nums text-gray-800">{counted == null ? '—' : formatEUR(counted / 100)}</span>
                        </div>
                        {#if diff != null}
                          <div class="flex items-center justify-between">
                            <span class="text-gray-500">Differenza</span>
                            <span
                              class="font-bold tabular-nums"
                              class:text-green-700={diff === 0}
                              class:text-red-600={diff !== 0}
                            >{diff > 0 ? '+' : ''}{formatEUR(diff / 100)}</span>
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <div class="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-2">

          <!-- By till -->
          <div class="border border-gray-100 rounded-xl overflow-hidden sm:col-span-2">
            <div class="flex items-center justify-between bg-gray-50 px-4 py-2">
              <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Per cassa</p>
              <p class="text-xs font-semibold text-gray-500">
                Contanti {formatEUR(cashRevenue / 100)} · Carta {formatEUR(cardRevenue / 100)}
              </p>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-xs text-gray-400 border-b border-gray-100">
                  <th class="text-left px-4 py-2 font-medium">Cassa</th>
                  <th class="text-right px-4 py-2 font-medium">Ordini</th>
                  <th class="text-right px-4 py-2 font-medium">Coperti</th>
                  <th class="text-right px-4 py-2 font-medium">Contanti</th>
                  <th class="text-right px-4 py-2 font-medium">Carta</th>
                  <th class="text-right px-4 py-2 font-medium">Totale</th>
                </tr>
              </thead>
              <tbody>
                {#each byTill as row}
                  <tr class="border-b border-gray-50 last:border-0">
                    <td class="px-4 py-2 font-medium text-gray-800">{row.tillName}</td>
                    <td class="px-4 py-2 text-right text-gray-600">{row.orders}</td>
                    <td class="px-4 py-2 text-right text-gray-600">{row.covers}</td>
                    <td class="px-4 py-2 text-right text-gray-700">
                      <span class="font-semibold">{formatEUR(row.cashCents / 100)}</span>
                      <span class="ml-1 text-xs text-gray-400">({row.cashOrders})</span>
                    </td>
                    <td class="px-4 py-2 text-right text-blue-700">
                      <span class="font-semibold">{formatEUR(row.cardCents / 100)}</span>
                      <span class="ml-1 text-xs text-gray-400">({row.cardOrders})</span>
                    </td>
                    <td class="px-4 py-2 text-right font-bold text-green-800">{formatEUR(row.totalCents / 100)}</td>
                  </tr>
                {/each}
                <tr class="border-t border-gray-200 bg-green-50 font-bold">
                  <td class="px-4 py-2 text-green-950">Totale</td>
                  <td class="px-4 py-2 text-right text-green-950">{filteredOrders.length}</td>
                  <td class="px-4 py-2 text-right text-green-950">{totalCovers}</td>
                  <td class="px-4 py-2 text-right text-green-950">{formatEUR(cashRevenue / 100)}</td>
                  <td class="px-4 py-2 text-right text-green-950">{formatEUR(cardRevenue / 100)}</td>
                  <td class="px-4 py-2 text-right text-green-950">{formatEUR(totalRevenue / 100)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- By station -->
          <div class="border border-gray-100 rounded-xl overflow-hidden">
            <p class="text-xs font-bold uppercase tracking-wider text-gray-400 px-4 py-2 bg-gray-50">Per stazione</p>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-xs text-gray-400 border-b border-gray-100">
                  <th class="text-left px-4 py-2 font-medium">Stazione</th>
                  <th class="text-right px-4 py-2 font-medium">Pezzi</th>
                  <th class="text-right px-4 py-2 font-medium">Incasso</th>
                </tr>
              </thead>
              <tbody>
                {#each byStation as row}
                  <tr class="border-b border-gray-50 last:border-0">
                    <td class="px-4 py-2 font-medium text-gray-800">{row.station}</td>
                    <td class="px-4 py-2 text-right text-gray-600">{row.qty}</td>
                    <td class="px-4 py-2 text-right font-semibold text-green-800">{formatEUR(row.cents / 100)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Top items -->
          <div class="border border-gray-100 rounded-xl overflow-hidden">
            <p class="text-xs font-bold uppercase tracking-wider text-gray-400 px-4 py-2 bg-gray-50">Articoli più venduti</p>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-xs text-gray-400 border-b border-gray-100">
                  <th class="text-left px-4 py-2 font-medium">Articolo</th>
                  <th class="text-right px-4 py-2 font-medium">Qtà</th>
                  <th class="text-right px-4 py-2 font-medium">Incasso</th>
                </tr>
              </thead>
              <tbody>
                {#each topItems as item}
                  <tr class="border-b border-gray-50 last:border-0">
                    <td class="px-4 py-2 text-gray-800 truncate max-w-[140px]">{item.name}</td>
                    <td class="px-4 py-2 text-right font-bold text-gray-800">{item.qty}</td>
                    <td class="px-4 py-2 text-right text-green-800">{formatEUR(item.cents / 100)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

        </div>

        <!-- Order trend -->
        {#if orderTrend.length > 0}
          <div class="mx-4 mb-4 border border-gray-100 rounded-xl overflow-hidden">
            <div class="flex flex-col gap-3 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Andamento ordini</p>
                <p class="text-sm font-semibold text-gray-800">
                  {#if period === 'hour' && !rangeActive}
                    Ultima ora, divisa ogni 10 minuti
                  {:else if period === 'all' || (rangeActive && !isSingleDay)}
                    Distribuzione per fascia oraria
                  {:else}
                    Ordini per ora
                  {/if}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div class="rounded-lg bg-white dark:bg-[#20242c] px-3 py-2">
                  <span class="block text-gray-400">Picco</span>
                  <span class="font-bold text-gray-900">{trendSummary.peak?.rangeLabel ?? '-'}</span>
                </div>
                <div class="rounded-lg bg-white dark:bg-[#20242c] px-3 py-2">
                  <span class="block text-gray-400">Ordini picco</span>
                  <span class="font-bold text-gray-900">{trendSummary.peak?.orders ?? 0}</span>
                </div>
                <div class="rounded-lg bg-white dark:bg-[#20242c] px-3 py-2">
                  <span class="block text-gray-400">Media</span>
                  <span class="font-bold text-gray-900">{trendSummary.averageOrders.toFixed(1)}</span>
                </div>
                <div class="rounded-lg bg-white dark:bg-[#20242c] px-3 py-2">
                  <span class="block text-gray-400">Scontrino medio</span>
                  <span class="font-bold text-gray-900">{formatEUR(trendSummary.averageTicketCents / 100)}</span>
                </div>
              </div>
            </div>

            <div class="p-4">
              <div class="grid grid-cols-[2.5rem_1fr] gap-3">
                <div class="flex flex-col justify-between pb-7 pt-1 text-right text-[10px] text-gray-300">
                  <span>{trendSummary.peak?.orders ?? 0}</span>
                  <span>{Math.round((trendSummary.peak?.orders ?? 0) / 2)}</span>
                  <span>0</span>
                </div>
                <div>
                  <div class="overflow-x-auto pb-1">
                    <div class="relative flex h-44 min-w-[32rem] items-end gap-1 border-b border-l border-gray-100 pl-2">
                      <div class="pointer-events-none absolute inset-x-2 top-0 border-t border-dashed border-gray-100"></div>
                      <div class="pointer-events-none absolute inset-x-2 top-1/2 border-t border-dashed border-gray-100"></div>
                      {#each orderTrend as bucket}
                        <div class="group relative flex min-w-5 flex-1 flex-col items-center justify-end gap-1">
                          {#if bucket.orders > 0}
                            <span class="text-[10px] font-semibold text-gray-500">{bucket.orders}</span>
                          {:else}
                            <span class="text-[10px] text-transparent">0</span>
                          {/if}
                          <div class="relative flex h-32 w-full items-end justify-center">
                            <div
                              class="w-full max-w-8 rounded-t bg-green-700 transition-colors group-hover:bg-green-800"
                              class:bg-gray-200={bucket.orders === 0}
                              title={`${bucket.rangeLabel}: ${bucket.orders} ordini, ${formatEUR(bucket.cents / 100)}`}
                              style="height: {bucket.orders === 0 ? 3 : Math.max(8, bucket.pct * 1.28)}px"
                            ></div>
                            {#if bucket.cents > 0}
                              <div
                                class="absolute bottom-0 w-1 rounded-t bg-amber-400"
                                title={`${bucket.rangeLabel}: incasso ${formatEUR(bucket.cents / 100)}`}
                                style="height: {Math.max(6, bucket.revenuePct * 1.28)}px"
                              ></div>
                            {/if}
                          </div>
                          <span class="w-full truncate text-center text-[10px] text-gray-400">{bucket.label}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                  <div class="mt-3 flex items-center justify-end gap-4 text-xs text-gray-500">
                    <span class="inline-flex items-center gap-1"><span class="h-2 w-3 rounded-sm bg-green-700"></span> Ordini</span>
                    <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-amber-400"></span> Incasso</span>
                  </div>
                </div>
              </div>

              <div class="mt-4 overflow-hidden rounded-lg border border-gray-100">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="bg-gray-50 text-xs text-gray-400">
                      <th class="px-3 py-2 text-left font-medium">Fascia</th>
                      <th class="px-3 py-2 text-right font-medium">Ordini</th>
                      <th class="px-3 py-2 text-right font-medium">Quota</th>
                      <th class="px-3 py-2 text-right font-medium">Incasso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each topTrendBuckets as bucket}
                      <tr class="border-t border-gray-50">
                        <td class="px-3 py-2 font-medium text-gray-800">{bucket.rangeLabel}</td>
                        <td class="px-3 py-2 text-right font-bold text-gray-800">{bucket.orders}</td>
                        <td class="px-3 py-2 text-right text-gray-500">
                          {filteredOrders.length ? Math.round((bucket.orders / filteredOrders.length) * 100) : 0}%
                        </td>
                        <td class="px-3 py-2 text-right font-semibold text-green-800">{formatEUR(bucket.cents / 100)}</td>
                      </tr>
                    {:else}
                      <tr>
                        <td colspan="4" class="px-3 py-6 text-center text-sm text-gray-400">Nessuna fascia con ordini</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        {/if}

      {:else if tab === 'items'}

        <!-- Sold items list -->
        <div class="p-4">
          <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Articoli venduti</p>
              <h2 class="text-xl font-black text-gray-900">{rangeLabel}</h2>
            </div>
            <div class="flex flex-wrap items-end justify-end gap-2">
              <div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div class="rounded-lg bg-gray-50 px-3 py-2 text-right">
                  <span class="block text-xs font-semibold text-gray-400">Ordini</span>
                  <span class="font-black text-gray-900">{filteredOrders.length}</span>
                </div>
                <div class="rounded-lg bg-gray-50 px-3 py-2 text-right">
                  <span class="block text-xs font-semibold text-gray-400">Coperti</span>
                  <span class="font-black text-gray-900">{totalCovers}</span>
                </div>
                <div class="rounded-lg bg-gray-50 px-3 py-2 text-right">
                  <span class="block text-xs font-semibold text-gray-400">Articoli diversi</span>
                  <span class="font-black text-gray-900">{soldItems.length}</span>
                </div>
                <div class="rounded-lg bg-gray-50 px-3 py-2 text-right">
                  <span class="block text-xs font-semibold text-gray-400">Pezzi totali</span>
                  <span class="font-black text-gray-900">{soldItemsTotalQty}</span>
                </div>
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={exportSoldItemsCsv}
                  disabled={soldItems.length === 0}
                  class="rounded-lg border border-green-800 px-4 py-2 text-sm font-bold text-green-900 hover:bg-green-50 disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onclick={exportSoldItemsPdf}
                  disabled={soldItems.length === 0}
                  class="rounded-lg border border-green-800 px-4 py-2 text-sm font-bold text-green-900 hover:bg-green-50 disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onclick={exportSoldItemsExcel}
                  disabled={soldItems.length === 0}
                  class="rounded-lg border border-green-800 px-4 py-2 text-sm font-bold text-green-900 hover:bg-green-50 disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  Excel
                </button>
              </div>
            </div>
          </div>

          <div class="overflow-hidden rounded-xl border border-gray-100">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 text-xs text-gray-400">
                  <th class="px-4 py-2 text-left font-medium">Articolo</th>
                  <th class="px-4 py-2 text-left font-medium">Stazione</th>
                  <th class="px-4 py-2 text-right font-medium">Qtà</th>
                  <th class="px-4 py-2 text-right font-medium">Prezzo</th>
                  <th class="px-4 py-2 text-right font-medium">Incasso</th>
                </tr>
              </thead>
              <tbody>
                {#each soldItems as item, index (item.itemId)}
                  <tr class="border-t border-gray-50" class:bg-gray-50={index % 2 === 1}>
                    <td class="px-4 py-2 font-semibold text-gray-800">
                      <span class="block truncate max-w-[20rem]">{item.name}</span>
                    </td>
                    <td class="px-4 py-2 text-gray-500">{item.station}</td>
                    <td class="px-4 py-2 text-right text-lg font-black tabular-nums text-gray-900">{item.qty}</td>
                    <td class="px-4 py-2 text-right text-gray-500 tabular-nums">{formatEUR(item.unitPriceCents / 100)}</td>
                    <td class="px-4 py-2 text-right font-bold text-green-800 tabular-nums">{formatEUR(item.cents / 100)}</td>
                  </tr>
                {:else}
                  <tr>
                    <td colspan="5" class="px-4 py-8 text-center text-gray-400">Nessun articolo venduto nel periodo selezionato</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

      {:else}

        <!-- Orders list -->
        <div class="flex flex-col divide-y divide-gray-100 px-4 py-2">
          {#each filteredOrders as order}
            <div class="py-2">
              <button
                type="button"
                onclick={() => expandedId = expandedId === order.id ? null : order.id}
                class="w-full text-left flex items-center gap-3"
              >
                <div class="shrink-0 text-xs text-gray-400 w-10 text-right">
                  <span class="block font-mono">{fmtTime(order.createdAt)}</span>
                  <span class="block">{fmtDate(order.createdAt)}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-semibold text-gray-800">{order.tillName}</span>
                  <span class="text-xs text-gray-400 ml-2">{order.people} cop.</span>
                </div>
                <div class="shrink-0 flex items-center gap-2">
                  {#if order.paymentMethod === 'card'}
                    <span class="text-xs font-medium text-blue-600">💳</span>
                  {:else}
                    <span class="text-xs font-medium text-gray-400">💵</span>
                  {/if}
                  {#if order.source === 'qr'}
                    <span class="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">QR</span>
                  {/if}
                  <span class="text-sm font-bold text-green-800 w-20 text-right">{formatEUR(order.totalCents / 100)}</span>
                  <span class="text-gray-400 text-xs">{expandedId === order.id ? '▲' : '▼'}</span>
                </div>
              </button>

              {#if expandedId === order.id}
                <div class="mt-2 ml-14 pl-2 border-l-2 border-gray-100">
                  <!-- Lines -->
                  {#each order.lines as line}
                    <div class="flex justify-between text-xs py-0.5 text-gray-600">
                      <span>{line.qty}× {line.name}</span>
                      <span class="font-medium">{formatEUR((line.qty * line.unitPriceCents) / 100)}</span>
                    </div>
                  {/each}

                  <!-- Void actions -->
                  <div class="flex flex-wrap items-center gap-2 pt-2 pb-1">
                    {#if voidError && voidingId === order.id}
                      <span class="basis-full text-xs text-red-600">{voidError}</span>
                    {/if}
                    {#if printError?.id === order.id}
                      <span class="basis-full text-xs text-red-600">{printError.message}</span>
                    {:else if printSuccessId === order.id}
                      <span class="basis-full text-xs text-green-700">Ordine ristampato.</span>
                    {/if}
                    <button
                      type="button"
                      onclick={() => handleReprint(order)}
                      disabled={printingId === order.id}
                      class="px-3 py-1 rounded text-xs font-semibold bg-green-50 text-green-800 hover:bg-green-100 disabled:opacity-40"
                    >
                      {printingId === order.id ? '…' : 'Ristampa'}
                    </button>
                    <button
                      type="button"
                      onclick={() => handleVoid(order, false)}
                      disabled={voidingId === order.id}
                      class="px-3 py-1 rounded text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40"
                    >
                      {voidingId === order.id ? '…' : 'Annulla ordine'}
                    </button>
                    <button
                      type="button"
                      onclick={() => handleVoid(order, true)}
                      disabled={voidingId === order.id}
                      class="px-3 py-1 rounded text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40"
                      title="Annulla e ricarica gli stessi articoli nel carrello per correggere"
                    >
                      {voidingId === order.id ? '…' : 'Annulla e correggi'}
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>

      {/if}
    </div>

  </div>

  {#if printPreview}
    <PrintPreview
      stations={printPreview.stations}
      receipt={printPreview.receipt}
      error={printPreview.error}
      onClose={() => printPreview = null}
    />
  {/if}
</div>
