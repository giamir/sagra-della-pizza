<script lang="ts">
  import { onMount } from 'svelte';
  import { formatEUR } from '@sagra/shared/utils/currency';
  import { STATION_ORDER, normalizeStation } from '$lib/station-order';

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
  const TABS: { key: 'summary' | 'orders'; label: string }[] = [
    { key: 'summary', label: 'Riepilogo' },
    { key: 'orders',  label: 'Ordini' },
  ];
  let period = $state<Period>('today');
  // YYYY-MM-DD string; when set, overrides the period quick-filter
  let customDate = $state('');
  let tab = $state<'summary' | 'orders'>('summary');
  let orders = $state<ReportOrder[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let expandedId = $state<string | null>(null);
  let voidingId = $state<string | null>(null);
  let voidError = $state<string | null>(null);

  // Label shown above the orders list to tell the user what range is active
  const rangeLabel = $derived.by(() => {
    if (customDate) {
      const d = new Date(customDate + 'T00:00:00');
      return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    if (period === 'hour') return 'Ultima ora';
    if (period === 'today') return 'Oggi';
    return 'Tutti i giorni';
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

  function activeRange(): [string, string] {
    // Custom date picker takes priority
    if (customDate) {
      const from = new Date(customDate + 'T00:00:00').toISOString();
      const to   = new Date(customDate + 'T23:59:59.999').toISOString();
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
      else orders = result.orders;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Errore';
      orders = [];
    } finally {
      loading = false;
    }
  }

  onMount(load);
  $effect(() => { period; customDate; load(); });

  // --- Summary computations ---
  const totalRevenue   = $derived(orders.reduce((s, o) => s + o.totalCents, 0));
  const totalCovers    = $derived(orders.reduce((s, o) => s + o.people, 0));
  const cashOrders     = $derived(orders.filter((o) => o.paymentMethod === 'cash').length);
  const cardOrders     = $derived(orders.filter((o) => o.paymentMethod === 'card').length);

  const byStation = $derived.by(() => {
    const map = new Map<string, { qty: number; cents: number }>();
    for (const o of orders) {
      for (const l of o.lines) {
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

  const topItems = $derived.by(() => {
    const map = new Map<string, { name: string; qty: number; cents: number }>();
    for (const o of orders) {
      for (const l of o.lines) {
        const cur = map.get(l.itemId) ?? { name: l.name, qty: 0, cents: 0 };
        cur.qty += l.qty;
        cur.cents += l.qty * l.unitPriceCents;
        map.set(l.itemId, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  });

  const orderTrend = $derived.by((): TrendBucket[] => {
    if (period === 'hour' && !customDate) {
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
      for (const o of orders) {
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
    for (const o of orders) {
      const h = new Date(o.createdAt).getHours();
      const cur = map.get(h) ?? { orders: 0, cents: 0 };
      cur.orders++;
      cur.cents += o.totalCents;
      map.set(h, cur);
    }
    const hours = customDate || period === 'all'
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
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Rapporti"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-white flex flex-col"
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="flex flex-col flex-1 overflow-hidden">

    <!-- App bar -->
    <div class="shrink-0 h-12 bg-green-900 text-white flex flex-wrap items-center gap-2 px-4">
      <button type="button" onclick={onClose} class="text-green-200 hover:text-white font-bold text-sm mr-1">← Cassa</button>
      <span class="font-bold tracking-wide text-sm uppercase">Rapporti</span>
        <!-- Quick period buttons -->
        <div class="flex rounded-lg overflow-hidden border border-white/30 text-xs font-semibold"
          class:opacity-40={!!customDate}
        >
          {#each PERIODS as p}
            <button
              type="button"
              onclick={() => { customDate = ''; period = p.key; }}
              disabled={!!customDate}
              class="px-3 py-1.5 transition-colors"
              class:bg-white={period === p.key && !customDate}
              class:text-green-900={period === p.key && !customDate}
              class:text-white={period !== p.key || !!customDate}
              class:opacity-60={period !== p.key}
            >{p.label}</button>
          {/each}
        </div>

        <!-- Date picker -->
        <div class="flex items-center gap-1">
          <input
            type="date"
            bind:value={customDate}
            class="rounded px-2 py-1 text-xs bg-transparent text-white focus:outline-none focus:ring-1 focus:ring-white border {customDate ? 'border-white' : 'border-white/30'}"
            title="Filtra per giorno specifico"
          />
          {#if customDate}
            <button type="button" onclick={() => customDate = ''} class="text-white/60 hover:text-white text-xs px-1" title="Rimuovi filtro data">✕</button>
          {/if}
        </div>

        <button type="button" onclick={load} class="text-white/60 hover:text-white text-lg" title="Aggiorna">↻</button>
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
      {:else if orders.length === 0}
        <div class="flex items-center justify-center h-40 text-gray-400">Nessun ordine nel periodo selezionato</div>
      {:else if tab === 'summary'}

        <!-- KPI row -->
        <div class="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div class="bg-green-50 rounded-xl p-4 text-center">
            <p class="text-2xl font-bold text-green-900">{formatEUR(totalRevenue / 100)}</p>
            <p class="text-xs text-green-700 mt-1 font-medium">Incasso totale</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center">
            <p class="text-2xl font-bold text-gray-800">{orders.length}</p>
            <p class="text-xs text-gray-500 mt-1 font-medium">Ordini</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center">
            <p class="text-2xl font-bold text-gray-800">{totalCovers}</p>
            <p class="text-xs text-gray-500 mt-1 font-medium">Coperti</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center">
            <p class="text-lg font-bold text-gray-800">
              <span class="text-gray-600">💵 {cashOrders}</span>
              <span class="mx-1 text-gray-300">·</span>
              <span class="text-blue-700">💳 {cardOrders}</span>
            </p>
            <p class="text-xs text-gray-500 mt-1 font-medium">Contanti / Carta</p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-2">

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
                  {#if period === 'hour' && !customDate}
                    Ultima ora, divisa ogni 10 minuti
                  {:else if period === 'all'}
                    Distribuzione per fascia oraria
                  {:else}
                    Ordini per ora
                  {/if}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div class="rounded-lg bg-white px-3 py-2">
                  <span class="block text-gray-400">Picco</span>
                  <span class="font-bold text-gray-900">{trendSummary.peak?.rangeLabel ?? '-'}</span>
                </div>
                <div class="rounded-lg bg-white px-3 py-2">
                  <span class="block text-gray-400">Ordini picco</span>
                  <span class="font-bold text-gray-900">{trendSummary.peak?.orders ?? 0}</span>
                </div>
                <div class="rounded-lg bg-white px-3 py-2">
                  <span class="block text-gray-400">Media</span>
                  <span class="font-bold text-gray-900">{trendSummary.averageOrders.toFixed(1)}</span>
                </div>
                <div class="rounded-lg bg-white px-3 py-2">
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
                          {orders.length ? Math.round((bucket.orders / orders.length) * 100) : 0}%
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

      {:else}

        <!-- Orders list -->
        <div class="flex flex-col divide-y divide-gray-100 px-4 py-2">
          {#each orders as order}
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
                  <div class="flex items-center gap-2 pt-2 pb-1">
                    {#if voidError && voidingId === order.id}
                      <span class="text-xs text-red-600 flex-1">{voidError}</span>
                    {/if}
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
</div>
