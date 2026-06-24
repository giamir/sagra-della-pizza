<script lang="ts">
  import { onMount, tick } from 'svelte';
  import jsQR from 'jsqr';
  import { decodeOrder } from '@sagra/shared/utils/payload';
  import { buildPriceIndex, optionsForItem } from '@sagra/shared/utils/pricing';
  import { buildStockIdIndex, stockIdForCartKey } from '@sagra/shared/utils/stock';
  import { formatEUR } from '@sagra/shared/utils/currency';
  import type { Payload, MenuItem, MenuOption } from '@sagra/shared/types';
  import menuData from '@sagra/shared/data/menu.json';
  import type { Menu } from '@sagra/shared/types';
  import ItemBrowser from './ItemBrowser.svelte';
  import CartPanel from './CartPanel.svelte';
  import VariantPicker from './VariantPicker.svelte';
  import OptionsPicker from './OptionsPicker.svelte';
  import PrintPreview from '$lib/components/PrintPreview.svelte';
  import PrinterSettings from '$lib/components/PrinterSettings.svelte';
  import TillSettings from '$lib/components/TillSettings.svelte';
  import StockAdmin from '$lib/components/StockAdmin.svelte';
  import PaymentModal from '$lib/components/PaymentModal.svelte';
  import PaymentSettings from '$lib/components/PaymentSettings.svelte';
  import Reports from '$lib/components/Reports.svelte';
  import CatalogAdmin from '$lib/components/CatalogAdmin.svelte';
  import BackupRestore from '$lib/components/BackupRestore.svelte';
  import AboutUpdates from '$lib/components/AboutUpdates.svelte';
  import { theme, toggleTheme } from '$lib/theme.svelte';

  const MENU = menuData as Menu;
  const PRICE_INDEX = buildPriceIndex(MENU);
  const STOCK_INDEX = buildStockIdIndex(MENU);
  const LIVE_STATS_REFRESH_MS = 15000;
  const LOW_STOCK_LIMIT = 5;
  // Re-publish our cart hold periodically so the host doesn't drop it as stale
  // (host TTL is ~2 min). Also covers a brief earlier push that failed.
  const RESERVATION_HEARTBEAT_MS = 20000;

  type ReportLine = {
    itemId: string;
    name: string;
    qty: number;
    unitPriceCents: number;
    station: string;
  };

  type ReportOrder = {
    id: string;
    tillName: string;
    createdAt: string;
    people: number;
    totalCents: number;
    source: 'qr' | 'manual';
    paymentMethod: 'cash' | 'card';
    lines: ReportLine[];
  };

  // --- Cart state ---
  let cart = $state<Record<string, number>>({});
  let people = $state(1);

  // --- UI state ---
  let activeCategoryId = $state(MENU.categories[0].id);
  let variantItem = $state<MenuItem | null>(null);
  type OptionsPickerState = { item: MenuItem; options: MenuOption[]; variants?: Array<{ id: string; label: string }>; baseId: string; baseName: string };
  let optionsPicker = $state<OptionsPickerState | null>(null);
  let scanMode = $state(false);
  let scanError = $state<string | null>(null);
  let completing = $state(false);
  let statusMessage = $state<string | null>(null);
  let orderSource = $state<'manual' | 'qr'>('manual');
  // Bumped each time a QR/phone order is loaded, so the cart panel can flash
  // even on back-to-back QR loads (where orderSource stays 'qr').
  let qrLoadTick = $state(0);
  let printPreview = $state<{ stations: { name: string; text: string }[]; receipt: string; error: string } | null>(null);
  let settingsOpen = $state(false);
  let tillSettingsOpen = $state(false);
  let stockAdminOpen = $state(false);
  let paymentSettingsOpen = $state(false);
  let reportsOpen = $state(false);
  let menuOpen = $state(false);
  let liveStatsOpen = $state(false);
  let tillName = $state('Cassa');
  let paymentModalOpen = $state(false);
  let paymentEnabled = $state(false);
  let catalogAdminOpen = $state(false);
  let backupOpen = $state(false);
  let aboutUpdatesOpen = $state(false);
  let todayOrders = $state<ReportOrder[]>([]);
  let statsLoading = $state(false);
  let statsError = $state<string | null>(null);
  let statsIncreased = $state(false);
  let statsDeltaCents = $state(0);

  // --- Stock ---
  let stock = $state<Record<string, number>>({});
  // Units held in carts across all tills (keyed by stock id). Effective
  // remaining = stock − reserved; that is what drives "rimasti" / esaurito.
  let reserved = $state<Record<string, number>>({});

  // --- Camera ---
  let video = $state<HTMLVideoElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let stream: MediaStream | null = null;
  let rafId = 0;
  let lastScannedCode = '';
  let lastScannedAt = 0;

  // --- USB keyboard wedge ---
  let scanBuffer = '';
  let scanBufferTimer = 0;
  let lastStatsRevenueCents = 0;
  let statsAnimationTimer = 0;

  // --- Derived ---
  const cartLines = $derived.by(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const entry = PRICE_INDEX[id];
        const price = entry?.price ?? 0;
        return { id, name: entry?.name ?? id, categoryLabel: entry?.categoryLabel ?? '', price, qty, subtotal: price * qty };
      });
  });

  const itemsTotal = $derived(cartLines.reduce((s, l) => s + l.subtotal, 0));
  const copertoTotal = $derived(people * MENU.coperto.perPersona);
  const total = $derived(itemsTotal + copertoTotal);
  const cartIsEmpty = $derived(cartLines.length === 0);
  const liveStats = $derived.by(() => {
    const orderCount = todayOrders.length;
    const revenueCents = todayOrders.reduce((sum, order) => sum + order.totalCents, 0);
    const covers = todayOrders.reduce((sum, order) => sum + order.people, 0);
    const cashCents = todayOrders
      .filter((order) => order.paymentMethod === 'cash')
      .reduce((sum, order) => sum + order.totalCents, 0);
    const cardCents = revenueCents - cashCents;
    const averageCents = orderCount > 0 ? Math.round(revenueCents / orderCount) : 0;

    const itemMap = new Map<string, { id: string; name: string; qty: number; cents: number }>();
    for (const order of todayOrders) {
      for (const line of order.lines) {
        const current = itemMap.get(line.itemId) ?? {
          id: line.itemId,
          name: line.name,
          qty: 0,
          cents: 0
        };
        current.qty += line.qty;
        current.cents += line.qty * line.unitPriceCents;
        itemMap.set(line.itemId, current);
      }
    }

    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.qty - a.qty || b.cents - a.cents)
      .slice(0, 3);

    const lowStock = Object.entries(stock)
      .filter(([, remaining]) => remaining >= 0 && remaining <= LOW_STOCK_LIMIT)
      .map(([id, remaining]) => ({ id, name: PRICE_INDEX[id]?.name ?? id, remaining }))
      .sort((a, b) => a.remaining - b.remaining || a.name.localeCompare(b.name, 'it'))
      .slice(0, 4);

    return { orderCount, revenueCents, covers, cashCents, cardCents, averageCents, topItems, lowStock };
  });

  // --- Stock helpers ---
  // Units of a stock id sitting in our own cart right now (across variants/opts).
  function cartHeldForStock(stockId: string): number {
    let sum = 0;
    for (const [key, qty] of Object.entries(cart)) {
      if (qty > 0 && stockIdForCartKey(key, STOCK_INDEX) === stockId) sum += qty;
    }
    return sum;
  }

  // Effective remaining for a cart key: Infinity when the item has no stock
  // limit, otherwise persisted remaining minus units held in carts. We take the
  // max of the broadcast hold and our local cart so a burst of clicks before the
  // hold round-trips can't push us past zero (checkout stays the hard backstop).
  function effectiveRemaining(key: string): number {
    const stockId = stockIdForCartKey(key, STOCK_INDEX);
    if (!(stockId in stock)) return Infinity;
    const held = Math.max(reserved[stockId] ?? 0, cartHeldForStock(stockId));
    return stock[stockId] - held;
  }

  function flashEsaurito(id: string) {
    const name = PRICE_INDEX[id]?.name ?? id;
    statusMessage = `${name} esaurito — non aggiunto`;
    setTimeout(() => { statusMessage = null; }, 3000);
  }

  // --- Cart actions ---
  function addItem(id: string) {
    if (effectiveRemaining(id) <= 0) { flashEsaurito(id); return; }
    cart[id] = (cart[id] ?? 0) + 1;
  }

  function incLine(id: string) {
    if (effectiveRemaining(id) <= 0) { flashEsaurito(id); return; }
    cart[id] = (cart[id] ?? 0) + 1;
  }

  function decLine(id: string) {
    const cur = cart[id] ?? 0;
    if (cur <= 1) delete cart[id];
    else cart[id] = cur - 1;
  }

  function removeLine(id: string) {
    delete cart[id];
  }

  function clearCart() {
    for (const k of Object.keys(cart)) delete cart[k];
    people = 1;
    orderSource = 'manual';
    statusMessage = null;
  }

  function setPeople(n: number) {
    people = Math.max(0, Math.min(30, n));
  }

  // --- Cart hold (reservation) publishing ---
  // Whenever the cart changes we publish it to the host (debounced) so its items
  // count against the live "rimasti" every till sees. An empty cart clears it.
  let reservationPushTimer = 0;

  async function pushReservation() {
    const lines = Object.entries(cart).filter(([, q]) => q > 0) as [string, number][];
    try { await window.api.setReservation(lines); } catch { /* best-effort */ }
  }

  function scheduleReservationPush() {
    clearTimeout(reservationPushTimer);
    reservationPushTimer = window.setTimeout(pushReservation, 150);
  }

  // React to any cart mutation and (debounced) re-publish the hold.
  $effect(() => {
    void cartLines; // track cart contents
    scheduleReservationPush();
  });

  function todayRange(): [string, string] {
    const now = new Date();
    return [
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
      now.toISOString()
    ];
  }

  function formatCents(cents: number): string {
    return formatEUR(cents / 100);
  }

  function showStatsIncrease(deltaCents: number) {
    statsDeltaCents = deltaCents;
    statsIncreased = true;
    clearTimeout(statsAnimationTimer);
    statsAnimationTimer = window.setTimeout(() => {
      statsIncreased = false;
      statsDeltaCents = 0;
    }, 2600);
  }

  async function refreshLiveStats() {
    statsLoading = true;
    statsError = null;
    const [from, to] = todayRange();
    try {
      const result = await window.api.getReports(from, to);
      if (!result.ok) {
        statsError = result.error ?? 'Statistiche non disponibili';
        todayOrders = [];
        return;
      }
      const nextRevenueCents = result.orders.reduce(
        (sum: number, order: ReportOrder) => sum + order.totalCents,
        0
      );
      if (lastStatsRevenueCents > 0 && nextRevenueCents > lastStatsRevenueCents) {
        showStatsIncrease(nextRevenueCents - lastStatsRevenueCents);
      }
      lastStatsRevenueCents = nextRevenueCents;
      todayOrders = result.orders;
    } catch (error) {
      statsError = error instanceof Error ? error.message : 'Statistiche non disponibili';
      todayOrders = [];
    } finally {
      statsLoading = false;
    }
  }

  // Returns the options for the category that contains this item.
  function categoryOptionsFor(itemId: string): MenuOption[] {
    for (const cat of MENU.categories) {
      for (const group of cat.groups) {
        if (group.items.some((i) => i.id === itemId || i.variants?.some((v) => v.id === itemId))) {
          return cat.options ?? [];
        }
      }
    }
    return [];
  }

  // --- Item tap: variant picker or direct add ---
  function handleItemTap(item: MenuItem) {
    if (item.variants?.length && !item.optionalVariants) {
      // Required variants (e.g. bianca/rossa) must be chosen before adding.
      variantItem = item;
    } else {
      // Plain items and optional-variant items add the base directly; the
      // OptionsPicker is reached only via the explicit "+ opzioni" button.
      addItem(item.id);
    }
  }

  function handleVariantSelect(variantId: string) {
    const item = variantItem;
    if (!item) return;

    const variant = item.variants?.find((v) => v.id === variantId);
    const isPlain = variantId === item.id; // "Normale" for optionalVariants items
    if (!variant && !isPlain) return;

    const selectedName = isPlain ? item.name : `${item.name} - ${variant!.label}`;
    const catOptions = optionsForItem(item, categoryOptionsFor(variantId));
    variantItem = null;
    if (catOptions.length > 0) {
      optionsPicker = {
        item,
        options: catOptions,
        baseId: variantId,
        baseName: selectedName
      };
    } else {
      addItem(variantId);
    }
  }

  // Called when cashier explicitly requests options for an item (e.g. celiaci / s/lattosio).
  function handleOptionsRequest(item: MenuItem) {
    const catOptions = optionsForItem(item, categoryOptionsFor(item.id));
    optionsPicker = {
      item,
      options: catOptions,
      variants: item.optionalVariants ? item.variants : undefined,
      baseId: item.id,
      baseName: item.name
    };
  }

  // --- QR / keyboard wedge ---
  function handleKeyInput(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

    if (event.key === 'Escape') {
      scanBuffer = '';
      clearTimeout(scanBufferTimer);
      if (scanMode) stopScan();
      return;
    }

    if (event.key === 'Enter') {
      clearTimeout(scanBufferTimer);
      const raw = scanBuffer.trim();
      scanBuffer = '';
      if (raw.length > 0) loadFromRaw(raw);
      return;
    }

    if (event.key.length === 1) {
      clearTimeout(scanBufferTimer);
      scanBuffer += event.key;
      scanBufferTimer = window.setTimeout(() => { scanBuffer = ''; }, 2000);
    }
  }

  function loadFromRaw(raw: string) {
    // Don't clobber an order that's being submitted/printed.
    if (completing) {
      scanError = 'Ordine in corso — attendi il completamento.';
      setTimeout(() => { scanError = null; }, 3000);
      stopScan();
      return;
    }
    // Don't silently wipe a cart the cashier is already working on. Same rule
    // the phone-push path applies (handleIncomingOrder): clear it first.
    if (!cartIsEmpty) {
      scanError = 'Carrello non vuoto — svuotalo per caricare il QR.';
      setTimeout(() => { scanError = null; }, 4000);
      stopScan();
      return;
    }

    try {
      let value = raw.trim();
      const hashIndex = value.indexOf('#p=');
      if (hashIndex !== -1) value = value.slice(hashIndex + 3);
      else if (value.startsWith('p=')) value = value.slice(2);

      const payload = decodeOrder(value);
      loadFromPayload(payload);
    } catch {
      // Surfaces keyboard-wedge layout problems on Windows: the raw string lets
      // you see whether characters (e.g. - _ # /) came through mistranslated.
      console.warn('[cassa] scan decode failed; raw input was:', JSON.stringify(raw));
      scanError = 'QR non valido — ordine non modificato.';
      setTimeout(() => { scanError = null; }, 3000);
    }
  }

  // Loads a scanned/incoming order into the cart, skipping items that are now
  // esaurito and capping those with fewer units left than requested. Returns
  // true when something had to be dropped/reduced (so callers keep the warning).
  function loadFromPayload(payload: Payload): boolean {
    for (const k of Object.keys(cart)) delete cart[k];

    const dropped: string[] = [];
    const reduced: string[] = [];
    const usedByStock: Record<string, number> = {};

    for (const [id, qty] of payload.l) {
      const stockId = stockIdForCartKey(id, STOCK_INDEX);
      if (!(stockId in stock)) { cart[id] = qty; continue; } // no limit
      const available = stock[stockId] - (reserved[stockId] ?? 0) - (usedByStock[stockId] ?? 0);
      const add = Math.max(0, Math.min(qty, available));
      if (add > 0) {
        cart[id] = add;
        usedByStock[stockId] = (usedByStock[stockId] ?? 0) + add;
      }
      if (add < qty) {
        const name = PRICE_INDEX[id]?.name ?? id;
        (add === 0 ? dropped : reduced).push(name);
      }
    }

    people = payload.p;
    orderSource = 'qr';
    qrLoadTick++;
    stopScan();

    if (dropped.length || reduced.length) {
      const parts: string[] = [];
      if (dropped.length) parts.push(`Esauriti, non aggiunti: ${dropped.join(', ')}`);
      if (reduced.length) parts.push(`Ridotti per scorte: ${reduced.join(', ')}`);
      statusMessage = parts.join(' · ');
      setTimeout(() => { statusMessage = null; }, 6000);
      return true;
    }

    statusMessage = `Ordine QR caricato · ${formatEUR(payload.t / 100)}`;
    setTimeout(() => { statusMessage = null; }, 3000);
    return false;
  }

  // Order pushed from the phone QR scanner over the LAN. Load it into the cart
  // for review unless the cashier already has an order in progress.
  function handleIncomingOrder(payload: Payload) {
    if (!cartIsEmpty || completing) {
      statusMessage = 'Ordine telefono in attesa — svuota il carrello per caricarlo';
      setTimeout(() => { statusMessage = null; }, 5000);
      return;
    }
    const hadIssues = loadFromPayload(payload);
    if (!hadIssues) {
      statusMessage = `Ordine dal telefono · ${formatEUR(payload.t / 100)} — verifica e incassa`;
      setTimeout(() => { statusMessage = null; }, 4000);
    }
  }

  async function startScan() {
    scanError = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      scanError = 'Nessuna fotocamera — usa lo scanner USB.';
      return;
    }
    scanMode = true;
    await tick();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (!video) throw new Error();
      video.srcObject = stream;
      await video.play();
      cameraLoop();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        scanError = 'Permesso fotocamera negato.';
      } else if (e instanceof DOMException && e.name === 'NotFoundError') {
        scanError = 'Fotocamera non trovata.';
      } else {
        scanError = 'Impossibile avviare la fotocamera.';
      }
      scanMode = false;
    }
  }

  function cameraLoop() {
    if (!scanMode || !video || !canvas) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if (code?.data) {
          const now = Date.now();
          if (code.data !== lastScannedCode || now - lastScannedAt > 5000) {
            lastScannedCode = code.data;
            lastScannedAt = now;
            loadFromRaw(code.data);
            return;
          }
        }
      }
    }
    rafId = requestAnimationFrame(cameraLoop);
  }

  function stopScan() {
    scanMode = false;
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  // --- Complete order ---

  // Called when cashier taps "Completa": show payment modal if ECR17 enabled, else go direct cash
  function initiateOrder() {
    if (cartIsEmpty || completing) return;
    if (paymentEnabled) {
      paymentModalOpen = true;
    } else {
      finaliseOrder('cash');
    }
  }

  async function finaliseOrder(paymentMethod: 'cash' | 'card' = 'cash') {
    if (cartIsEmpty || completing) return;
    paymentModalOpen = false;
    completing = true;
    statusMessage = 'Salvataggio…';
    try {
      const result = await window.api.submitOrder({
        people,
        totalCents: Math.round(total * 100),
        lines: Object.entries(cart).filter(([, q]) => q > 0),
        source: orderSource,
        paymentMethod
      });

      if (!result.ok) {
        if (result.oversold?.length) {
          const names = result.oversold.map((id: string) => {
            const entry = PRICE_INDEX[id];
            return entry?.name ?? id;
          });
          statusMessage = `Esauriti: ${names.join(', ')} — rimuovi dal carrello`;
          // Remove oversold items from cart
          for (const id of result.oversold) {
            delete cart[id];
          }
        } else {
          statusMessage = result.error ?? 'Errore salvataggio';
        }
        setTimeout(() => { statusMessage = null; }, 5000);
        return;
      }

      clearCart();
      statusMessage = 'Ordine salvato — stampa in corso…';

      // Print the order the host returned (its lines/stations), NOT a re-load by
      // id — a client till's order does not exist in its own local db.
      const printResult = result.order
        ? await window.api.printOrderData(result.order)
        : await window.api.printOrder(result.orderId);
      if (printResult.ok) {
        statusMessage = 'Ordine completato ✓';
      } else if (printResult.preview) {
        printPreview = { stations: printResult.preview.stations, receipt: printResult.preview.receipt, error: printResult.error };
        statusMessage = 'Ordine salvato — stampante non raggiungibile';
      } else {
        statusMessage = `Ordine salvato — ${printResult.error}`;
      }

      setTimeout(() => { statusMessage = null; }, 4000);
      void refreshLiveStats();
    } catch (err) {
      statusMessage = err instanceof Error ? err.message : 'Errore salvataggio.';
    } finally {
      completing = false;
    }
  }

  onMount(() => {
    let liveStatsTimer = 0;
    let heartbeatTimer = 0;
    let unsubStock: (() => void) | null = null;
    let unsubIncoming: (() => void) | null = null;

    window.addEventListener('keydown', handleKeyInput);

    void (async () => {
      // Load till name + ECR17 flag
      const [settings, payConfig] = await Promise.all([
        window.api.getSettings(),
        window.api.getPaymentConfig(),
      ]);
      tillName = settings.tillName || 'Cassa';
      paymentEnabled = payConfig.enabled;

      // Load initial stock + current cart holds
      stock = await window.api.getStock();
      reserved = await window.api.getReservations();
      await refreshLiveStats();
      liveStatsTimer = window.setInterval(() => {
        void refreshLiveStats();
      }, LIVE_STATS_REFRESH_MS);

      // Keep our hold alive so the host doesn't expire it mid-order.
      heartbeatTimer = window.setInterval(() => {
        if (!cartIsEmpty) void pushReservation();
      }, RESERVATION_HEARTBEAT_MS);

      // Subscribe to live stock + reservation updates (host broadcast / local).
      unsubStock = window.api.onStockUpdate(({ stock: s, reserved: r }) => {
        stock = s;
        reserved = r;
      });

      // Orders pushed from the phone QR scanner
      unsubIncoming = window.api.onIncomingOrder((payload) => {
        handleIncomingOrder(payload as Payload);
      });
    })();

    return () => {
      stopScan();
      window.removeEventListener('keydown', handleKeyInput);
      clearTimeout(scanBufferTimer);
      clearTimeout(statsAnimationTimer);
      clearTimeout(reservationPushTimer);
      if (liveStatsTimer) clearInterval(liveStatsTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      void window.api.setReservation([]); // release our hold on close
      unsubStock?.();
      unsubIncoming?.();
    };
  });
</script>

<div class="h-full flex flex-col bg-gray-100 select-none overflow-hidden">

  <!-- Header -->
  <header class="shrink-0 h-12 bg-green-900 text-white flex items-center px-4 gap-4 relative">
    <span class="font-bold tracking-wide text-sm uppercase">{tillName}</span>

    <!-- Status / error messages -->
    {#if statusMessage}
      <span class="text-green-200 text-sm font-medium truncate">{statusMessage}</span>
    {/if}
    {#if scanError}
      <span class="text-red-300 text-sm font-medium">{scanError}</span>
    {/if}

    <div
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      class:z-50={liveStatsOpen}
      class:z-10={!liveStatsOpen}
    >
      <button
        type="button"
        onclick={() => { liveStatsOpen = !liveStatsOpen; menuOpen = false; }}
        class="relative px-3 py-1 rounded-full text-xs font-bold border border-green-500 bg-green-950/30 text-green-50 hover:bg-green-800 tabular-nums overflow-visible"
        class:statsPop={statsIncreased}
        aria-expanded={liveStatsOpen}
      >
        Oggi {formatCents(liveStats.revenueCents)} · {liveStats.covers} coperti
        {#if statsIncreased && statsDeltaCents > 0}
          <span class="statsDelta absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-lime-300 px-2 py-0.5 text-[11px] font-black text-[#052e16] shadow-lg">
            +{formatCents(statsDeltaCents)}
          </span>
        {/if}
      </button>

      {#if liveStatsOpen}
        <button
          type="button"
          class="fixed inset-0 z-40 cursor-default"
          aria-label="Chiudi statistiche"
          onclick={() => liveStatsOpen = false}
        ></button>

        <section class="absolute left-1/2 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 bg-white dark:bg-[#20242c] text-gray-900 rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Oggi</p>
                <p class="text-2xl font-black tabular-nums text-green-900">{formatCents(liveStats.revenueCents)}</p>
              </div>
              <button
                type="button"
                onclick={refreshLiveStats}
                class="px-2 py-1 rounded text-xs font-bold text-green-800 bg-green-50 hover:bg-green-100"
              >
                Aggiorna
              </button>
            </div>
            <p class="mt-1 text-sm font-semibold text-gray-700">
              {liveStats.orderCount} ordini · {liveStats.covers} coperti · {formatCents(liveStats.averageCents)} medio
            </p>
            {#if statsLoading}
              <p class="mt-1 text-xs font-semibold text-gray-400">Aggiornamento…</p>
            {/if}
            {#if statsError}
              <p class="mt-1 text-xs font-semibold text-red-600">{statsError}</p>
            {/if}
          </div>

          <div class="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100">
            <div class="px-4 py-3">
              <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Contanti</p>
              <p class="text-lg font-black tabular-nums">{formatCents(liveStats.cashCents)}</p>
            </div>
            <div class="px-4 py-3">
              <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Carta</p>
              <p class="text-lg font-black tabular-nums">{formatCents(liveStats.cardCents)}</p>
            </div>
          </div>

          <div class="px-4 py-3 border-b border-gray-100">
            <p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Più venduti</p>
            {#if liveStats.topItems.length}
              <ul class="space-y-1">
                {#each liveStats.topItems as item (item.id)}
                  <li class="flex items-center justify-between gap-3 text-sm">
                    <span class="font-semibold truncate">{item.name}</span>
                    <span class="font-black tabular-nums text-green-900">{item.qty}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="text-sm font-semibold text-gray-500">Nessun ordine registrato.</p>
            {/if}
          </div>

          <div class="px-4 py-3">
            <p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Scorte basse</p>
            {#if liveStats.lowStock.length}
              <ul class="space-y-1">
                {#each liveStats.lowStock as item (item.id)}
                  <li class="flex items-center justify-between gap-3 text-sm">
                    <span class="font-semibold truncate">{item.name}</span>
                    <span class="font-black tabular-nums" class:text-red-700={item.remaining === 0} class:text-amber-700={item.remaining > 0}>
                      {item.remaining}
                    </span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="text-sm font-semibold text-gray-500">Nessuna scorta critica.</p>
            {/if}
          </div>
        </section>
      {/if}
    </div>

    <div class="ml-auto flex items-center gap-2">

      <!-- Operational: only shown when relevant -->
      {#if !cartIsEmpty}
        <button type="button" onclick={clearCart}
          class="px-3 py-1 rounded text-xs font-bold border border-green-600 text-green-200 hover:bg-green-800">
          Svuota
        </button>
      {/if}

      <!-- Hamburger menu -->
      <button
        type="button"
        onclick={() => { menuOpen = !menuOpen; liveStatsOpen = false; }}
        class="w-8 h-8 flex flex-col items-center justify-center gap-1 rounded hover:bg-green-800"
        aria-label="Menu"
      >
        <span class="block w-4 h-0.5 bg-white rounded"></span>
        <span class="block w-4 h-0.5 bg-white rounded"></span>
        <span class="block w-4 h-0.5 bg-white rounded"></span>
      </button>
    </div>

    <!-- Dropdown menu -->
    {#if menuOpen}
      <button
        type="button"
        class="fixed inset-0 z-40 cursor-default"
        aria-label="Chiudi menu"
        onclick={() => menuOpen = false}
      ></button>

      <div class="absolute top-full right-0 z-50 w-52 bg-white dark:bg-[#20242c] rounded-b-xl shadow-2xl border border-gray-100 overflow-hidden">
        <!-- Operazioni -->
        <p class="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-gray-400">Operazioni</p>
        <button type="button" onclick={() => { reportsOpen = true; menuOpen = false; }}
          class="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 flex items-center gap-2">
          <span class="w-5 text-center text-gray-400">▤</span> Rapporti
        </button>
        <button type="button" onclick={() => { stockAdminOpen = true; menuOpen = false; }}
          class="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 flex items-center gap-2">
          <span class="w-5 text-center text-gray-400">▦</span> Scorte
        </button>
        <button type="button" onclick={() => { catalogAdminOpen = true; menuOpen = false; }}
          class="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 flex items-center gap-2">
          <span class="w-5 text-center text-gray-400">☰</span> Catalogo
        </button>

        <div class="border-t border-gray-100 my-1"></div>

        <!-- Impostazioni -->
        <p class="px-4 pt-2 pb-1 text-xs font-bold uppercase tracking-wider text-gray-400">Impostazioni</p>
        <button type="button" onclick={() => { settingsOpen = true; menuOpen = false; }}
          class="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 flex items-center gap-2">
          <span class="w-5 text-center text-gray-400">⚙</span> Stampante
        </button>
        <button type="button" onclick={() => { paymentSettingsOpen = true; menuOpen = false; }}
          class="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 flex items-center gap-2">
          <span class="w-5 text-center text-gray-400">⚙</span> Terminale Nexi
        </button>
        <button type="button" onclick={() => { tillSettingsOpen = true; menuOpen = false; }}
          class="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 flex items-center gap-2 pb-3">
          <span class="w-5 text-center text-gray-400">⚙</span> Cassa / Rete
        </button>

        <div class="border-t border-gray-100 my-1"></div>

        <!-- Sistema -->
        <p class="px-4 pt-2 pb-1 text-xs font-bold uppercase tracking-wider text-gray-400">Sistema</p>
        <button type="button" onclick={() => { backupOpen = true; menuOpen = false; }}
          class="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 flex items-center gap-2">
          <span class="w-5 text-center text-gray-400">⛁</span> Backup / Ripristino
        </button>
        <button type="button" onclick={() => { aboutUpdatesOpen = true; menuOpen = false; }}
          class="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 flex items-center gap-2">
          <span class="w-5 text-center text-gray-400">↻</span> Aggiornamenti
        </button>
        <button type="button" onclick={() => { toggleTheme(); menuOpen = false; }}
          class="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 flex items-center gap-2 pb-3">
          <span class="w-5 text-center text-gray-400">{theme.mode === 'dark' ? '☀' : '☾'}</span>
          {theme.mode === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
        </button>
      </div>
    {/if}
  </header>

  <!-- QR Camera overlay -->
  {#if scanMode}
    <div class="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center gap-4 pt-12">
      <p class="text-white font-semibold">Inquadra il QR del cliente</p>
      <div class="relative rounded-lg overflow-hidden" style="width:480px;max-width:90vw">
        <video bind:this={video} class="w-full" muted playsinline></video>
        <canvas bind:this={canvas} class="hidden"></canvas>
      </div>
      <button
        type="button"
        onclick={stopScan}
        class="px-6 py-2 rounded-full bg-white dark:bg-[#20242c] text-gray-900 font-bold"
      >
        Annulla
      </button>
    </div>
  {/if}

  <!-- Main split layout -->
  <div class="flex-1 flex overflow-hidden">
    <ItemBrowser
      menu={MENU}
      {cart}
      {stock}
      {reserved}
      {activeCategoryId}
      onCategoryChange={(id) => activeCategoryId = id}
      onItemTap={handleItemTap}
      onOptionsRequest={handleOptionsRequest}
    />
    <CartPanel
      {cartLines}
      categoryOrder={MENU.categories.map((c) => c.label)}
      {people}
      copertoPerPerson={MENU.coperto.perPersona}
      {total}
      {completing}
      {orderSource}
      {qrLoadTick}
      onInc={incLine}
      onDec={decLine}
      onRemove={removeLine}
      onSetPeople={setPeople}
      onComplete={initiateOrder}
      onScanQr={startScan}
    />
  </div>

  <!-- Variant picker modal -->
  {#if variantItem}
    <VariantPicker
      item={variantItem}
      onSelect={handleVariantSelect}
      onClose={() => variantItem = null}
    />
  {/if}

  <!-- Options picker modal (impasto celiaci / s/lattosio, bianca/rossa, etc.) -->
  {#if optionsPicker}
    <OptionsPicker
      item={optionsPicker.item}
      options={optionsPicker.options}
      variants={optionsPicker.variants}
      baseId={optionsPicker.baseId}
      baseName={optionsPicker.baseName}
      onAdd={(key) => { addItem(key); optionsPicker = null; }}
      onClose={() => optionsPicker = null}
    />
  {/if}

  <!-- Print preview (when printer unreachable) -->
  {#if printPreview}
    <PrintPreview
      stations={printPreview.stations}
      receipt={printPreview.receipt}
      error={printPreview.error}
      onClose={() => printPreview = null}
    />
  {/if}

  <!-- Printer settings -->
  {#if settingsOpen}
    <PrinterSettings onClose={() => settingsOpen = false} />
  {/if}

  <!-- Till / network settings -->
  {#if tillSettingsOpen}
    <TillSettings onClose={async () => {
      tillSettingsOpen = false;
      const s = await window.api.getSettings();
      tillName = s.tillName || 'Cassa';
    }} />
  {/if}

  <!-- Stock admin -->
  {#if stockAdminOpen}
    <StockAdmin onClose={() => stockAdminOpen = false} />
  {/if}

  <!-- Payment method modal -->
  {#if paymentModalOpen}
    <PaymentModal
      totalCents={Math.round(total * 100)}
      onCash={() => finaliseOrder('cash')}
      onCardApproved={() => finaliseOrder('card')}
      onClose={() => paymentModalOpen = false}
    />
  {/if}

  <!-- Reports -->
  {#if reportsOpen}
    <Reports
      onClose={() => {
        reportsOpen = false;
        void refreshLiveStats();
      }}
      onReloadCart={(lines, p) => {
        for (const k of Object.keys(cart)) delete cart[k];
        for (const { id, qty } of lines) cart[id] = qty;
        people = p;
        orderSource = 'manual';
        reportsOpen = false;
        statusMessage = 'Ordine annullato — correggi e riconferma';
        setTimeout(() => { statusMessage = null; }, 4000);
      }}
    />
  {/if}

  <!-- Payment / ECR17 settings -->
  {#if paymentSettingsOpen}
    <PaymentSettings onClose={async () => {
      paymentSettingsOpen = false;
      const c = await window.api.getPaymentConfig();
      paymentEnabled = c.enabled;
    }} />
  {/if}

  <!-- Catalog admin -->
  {#if catalogAdminOpen}
    <CatalogAdmin onClose={() => catalogAdminOpen = false} />
  {/if}

  <!-- Database backup / restore -->
  {#if backupOpen}
    <BackupRestore onClose={() => backupOpen = false} />
  {/if}

  <!-- App version / updates -->
  {#if aboutUpdatesOpen}
    <AboutUpdates onClose={() => aboutUpdatesOpen = false} />
  {/if}

</div>

<style>
  .statsPop {
    animation: stats-pop 1800ms ease-out;
  }

  .statsDelta {
    animation: stats-delta-rise 2600ms ease-out forwards;
  }

  @keyframes stats-pop {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(190, 242, 100, 0);
    }
    20% {
      transform: scale(1.06);
      box-shadow: 0 0 0 6px rgba(190, 242, 100, 0.18);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 14px rgba(190, 242, 100, 0);
    }
  }

  @keyframes stats-delta-rise {
    0% {
      opacity: 0;
      transform: translate(-50%, 0) scale(0.92);
    }
    16% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -42px) scale(1);
    }
  }
</style>
