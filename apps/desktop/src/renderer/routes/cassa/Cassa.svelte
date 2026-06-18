<script lang="ts">
  import { onMount, tick } from 'svelte';
  import jsQR from 'jsqr';
  import { decodeOrder } from '@sagra/shared/utils/payload';
  import { buildPriceIndex } from '@sagra/shared/utils/pricing';
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

  const MENU = menuData as Menu;
  const PRICE_INDEX = buildPriceIndex(MENU);

  // --- Cart state ---
  let cart = $state<Record<string, number>>({});
  let people = $state(1);

  // --- UI state ---
  let activeCategoryId = $state(MENU.categories[0].id);
  let variantItem = $state<MenuItem | null>(null);
  type OptionsPickerState = { item: MenuItem; options: MenuOption[]; baseId: string; baseName: string };
  let optionsPicker = $state<OptionsPickerState | null>(null);
  let scanMode = $state(false);
  let scanError = $state<string | null>(null);
  let completing = $state(false);
  let statusMessage = $state<string | null>(null);
  let orderSource = $state<'manual' | 'qr'>('manual');
  let printPreview = $state<{ stations: { name: string; text: string }[]; receipt: string; error: string } | null>(null);
  let settingsOpen = $state(false);
  let tillSettingsOpen = $state(false);
  let stockAdminOpen = $state(false);
  let paymentSettingsOpen = $state(false);
  let reportsOpen = $state(false);
  let menuOpen = $state(false);
  let tillName = $state('Cassa');
  let paymentModalOpen = $state(false);
  let paymentEnabled = $state(false);
  let catalogAdminOpen = $state(false);

  // --- Stock ---
  let stock = $state<Record<string, number>>({});

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

  // --- Cart actions ---
  function addItem(id: string) {
    cart[id] = (cart[id] ?? 0) + 1;
  }

  function incLine(id: string) {
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
    statusMessage = null;
  }

  function setPeople(n: number) {
    people = Math.max(0, Math.min(30, n));
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
    if (item.variants?.length) {
      variantItem = item;
    } else {
      addItem(item.id);
    }
  }

  function handleVariantSelect(variantId: string) {
    addItem(variantId);
    variantItem = null;
  }

  // Called when cashier explicitly requests options for an item (e.g. celiaci / s/lattosio).
  function handleOptionsRequest(item: MenuItem) {
    const catOptions = categoryOptionsFor(item.id);
    if (catOptions.length > 0) {
      optionsPicker = { item, options: catOptions, baseId: item.id, baseName: item.name };
    }
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
    try {
      let value = raw.trim();
      const hashIndex = value.indexOf('#p=');
      if (hashIndex !== -1) value = value.slice(hashIndex + 3);
      else if (value.startsWith('p=')) value = value.slice(2);

      const payload = decodeOrder(value);
      loadFromPayload(payload);
    } catch {
      scanError = 'QR non valido — ordine non modificato.';
      setTimeout(() => { scanError = null; }, 3000);
    }
  }

  function loadFromPayload(payload: Payload) {
    for (const k of Object.keys(cart)) delete cart[k];
    for (const [id, qty] of payload.l) cart[id] = qty;
    people = payload.p;
    orderSource = 'qr';
    stopScan();
    statusMessage = `Ordine QR caricato · ${formatEUR(payload.t / 100)}`;
    setTimeout(() => { statusMessage = null; }, 3000);
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
      orderSource = 'manual';
      statusMessage = 'Ordine salvato — stampa in corso…';

      const printResult = await window.api.printOrder(result.orderId);
      if (printResult.ok) {
        statusMessage = 'Ordine completato ✓';
      } else if (printResult.preview) {
        printPreview = { stations: printResult.preview.stations, receipt: printResult.preview.receipt, error: printResult.error };
        statusMessage = 'Ordine salvato — stampante non raggiungibile';
      } else {
        statusMessage = `Ordine salvato — ${printResult.error}`;
      }

      setTimeout(() => { statusMessage = null; }, 4000);
    } catch (err) {
      statusMessage = err instanceof Error ? err.message : 'Errore salvataggio.';
    } finally {
      completing = false;
    }
  }

  onMount(async () => {
    window.addEventListener('keydown', handleKeyInput);

    // Load till name + ECR17 flag
    const [settings, payConfig] = await Promise.all([
      window.api.getSettings(),
      window.api.getPaymentConfig(),
    ]);
    tillName = settings.tillName || 'Cassa';
    paymentEnabled = payConfig.enabled;

    // Load initial stock
    stock = await window.api.getStock();

    // Subscribe to live stock updates (from host broadcast or local changes)
    const unsubStock = window.api.onStockUpdate((s) => { stock = s; });

    return () => {
      stopScan();
      window.removeEventListener('keydown', handleKeyInput);
      clearTimeout(scanBufferTimer);
      unsubStock();
    };
  });
</script>

<div class="h-screen flex flex-col bg-gray-100 select-none overflow-hidden">

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

    <div class="ml-auto flex items-center gap-2">
      <!-- Operational: only shown when relevant -->
      {#if !cartIsEmpty}
        <button type="button" onclick={clearCart}
          class="px-3 py-1 rounded text-xs font-bold border border-green-600 text-green-200 hover:bg-green-800">
          Svuota
        </button>
      {/if}
      <button type="button" onclick={scanMode ? stopScan : startScan}
        class="px-3 py-1 rounded text-xs font-bold bg-green-700 hover:bg-green-600 text-white">
        {scanMode ? 'Chiudi fotocamera' : 'Scansiona QR'}
      </button>

      <!-- Hamburger menu -->
      <button
        type="button"
        onclick={() => menuOpen = !menuOpen}
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
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="fixed inset-0 z-40" onclick={() => menuOpen = false}></div>

      <div class="absolute top-full right-0 z-50 w-52 bg-white rounded-b-xl shadow-2xl border border-gray-100 overflow-hidden">
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
        class="px-6 py-2 rounded-full bg-white text-gray-900 font-bold"
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

  <!-- Options picker modal (impasto celiaci / s/lattosio, etc.) -->
  {#if optionsPicker}
    <OptionsPicker
      item={optionsPicker.item}
      options={optionsPicker.options}
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
      onClose={() => reportsOpen = false}
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

</div>
