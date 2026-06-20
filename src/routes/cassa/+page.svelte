<script lang="ts">
  import { MENU } from '$lib/stores/order.svelte';
  import { formatEUR } from '$lib/utils/currency';
  import { decodeOrder } from '$lib/utils/payload';
  import type { Payload } from '$lib/types';
  import jsQR from 'jsqr';
  import { onMount, tick } from 'svelte';

  type CashierLine = {
    id: string;
    name: string;
    price: number;
    qty: number;
    subtotal: number;
    known: boolean;
  };

  type CashierCategory = {
    id: string;
    label: string;
    lines: CashierLine[];
  };

  type RecentScan = {
    id: string;
    scannedAt: string;
    payload: Payload;
    status: 'loaded' | 'failed';
    message: string;
    summary: string;
    totalCents: number;
  };

  type CassaConfig = {
    host: string;
    port: number;
    tillName: string;
  };

  const CASHIER_SECTIONS = [
    {
      id: 'bevande',
      label: 'Bevande',
      itemIds: [
        'acqua-naturale-litro',
        'acqua-gassata-litro',
        'acqua-frizzante',
        'acqua-naturale',
        'vino-bicchiere-rosso',
        'vino-bicchiere-bianco',
        'vino-frizzante',
        'vino-bottiglia-rosso',
        'vino-bottiglia-bianco',
        'vino-bottiglia-frizzante',
        'coca-cola-zero',
        'coca-cola',
        'fanta',
        'sprite',
        'the-limone',
        'the-pesca',
        'birra-spina-grande',
        'birra-spina-piccola',
        'ipa'
      ]
    },
    {
      id: 'griglia',
      label: 'Griglia',
      itemIds: [
        'salsicce',
        'bistecca-manzo-normale',
        'bistecca-manzo-al-sangue',
        'bistecca-manzo-ben-cotta',
        'rosticciana',
        'bistecca-maiale'
      ]
    },
    {
      id: 'crostini',
      label: 'Crostini',
      itemIds: ['crostini-romana', 'crostini-alici', 'crostini-misti']
    },
    { id: 'cecina', label: 'Cecina', itemIds: ['cecina'] },
    {
      id: 'gastronomia',
      label: 'Gastronomia',
      itemIds: ['lasagne', 'antipasto-toscano', 'prosciutto-melone', 'bruschetta']
    },
    {
      id: 'contorni',
      label: 'Contorni',
      itemIds: ['fagioli', 'insalata', 'patatine', 'pomodori']
    },
    {
      id: 'pizza',
      label: 'Pizza',
      itemIds: [
        'margherita',
        'prosciutto-cotto',
        'cipolla',
        'wurstel',
        'salame-piccante',
        'funghi',
        'funghi-salsiccia',
        'funghi-cotto',
        'salsiccia',
        'funghi-crudo',
        'prosciutto-crudo',
        'marinara',
        'napoli',
        'genova',
        'pisana',
        'salsiccia-cipolla',
        'focaccina-sale-olio',
        'focaccia-cotto',
        'focaccia-crudo'
      ]
    },
    {
      id: 'bar',
      label: 'Bar',
      itemIds: ['caffe', 'dolce-sagra', 'caffe-corretto', 'spumante-bottiglia', 'spumante']
    }
  ] as const;

  const RECENT_SCANS_KEY = 'sagra-cassa-recent-scans-v1';
  const RECENT_SCAN_LIMIT = 10;
  const CONFIG_KEY = 'sagra-cassa-config-v1';

  const DEFAULT_CONFIG: CassaConfig = {
    host: '192.168.1.1',
    port: 7331,
    tillName: 'Cassa telefono'
  };

  let payload = $state<Payload | null>(null);
  let error = $state<string | null>(null);
  let scanning = $state(false);
  let cameraRequiresHttps = $state(false);
  let configOpen = $state(false);
  let config = $state<CassaConfig>({ ...DEFAULT_CONFIG });
  let connectionState = $state<'idle' | 'checking' | 'connected' | 'failed'>('idle');
  let connectionMessage = $state('Connessione non verificata');
  let sending = $state(false);
  let sendMessage = $state<string | null>(null);
  let sendSuccess = $state(false);
  let scanStatusMessage = $state<string | null>(null);
  let recentScans = $state<RecentScan[]>([]);

  let video = $state<HTMLVideoElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let stream: MediaStream | null = null;
  let rafId = 0;
  let lastScannedCode = '';
  let lastScannedAt = 0;

  const connectionBadge = $derived.by(() => {
    if (connectionState === 'connected') return 'Cassa online';
    if (connectionState === 'checking') return 'Cassa verifica';
    if (connectionState === 'failed') return 'Cassa offline';
    return 'Cassa ?';
  });

  const menuLines = $derived.by(() => {
    const index: Record<string, CashierLine> = {};
    for (const category of MENU.categories) {
      for (const group of category.groups) {
        for (const item of group.items) {
          if (item.variants?.length) {
            for (const variant of item.variants) {
              index[variant.id] = {
                id: variant.id,
                name: `${item.name} - ${variant.label}`,
                price: item.price,
                qty: 0,
                subtotal: 0,
                known: true
              };
            }
          } else {
            index[item.id] = {
              id: item.id,
              name: item.name,
              price: item.price,
              qty: 0,
              subtotal: 0,
              known: true
            };
          }
        }
      }
    }
    return index;
  });

  function loadConfig(): CassaConfig {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_CONFIG };
    try {
      const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') as Partial<CassaConfig>;
      return {
        ...DEFAULT_CONFIG,
        ...stored,
        port: Number(stored.port ?? DEFAULT_CONFIG.port)
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(cfg: CassaConfig) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function loadRecentScans(): RecentScan[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_SCANS_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.slice(0, RECENT_SCAN_LIMIT) : [];
    } catch {
      return [];
    }
  }

  function saveRecentScans(scans: RecentScan[]) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(scans.slice(0, RECENT_SCAN_LIMIT)));
  }

  function summarizePayload(value: Payload): string {
    const names = value.l.slice(0, 3).map(([id, qty]) => {
      const line = menuLines[id];
      return `${qty}x ${line?.name ?? id}`;
    });
    const remaining = value.l.length - names.length;
    if (remaining > 0) names.push(`+${remaining}`);
    return names.length ? names.join(', ') : 'Solo coperti';
  }

  function rememberScan(value: Payload, status: RecentScan['status'], message: string) {
    const scan: RecentScan = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scannedAt: new Date().toISOString(),
      payload: value,
      status,
      message,
      summary: summarizePayload(value),
      totalCents: value.t
    };
    recentScans = [scan, ...recentScans].slice(0, RECENT_SCAN_LIMIT);
    saveRecentScans(recentScans);
  }

  function formatScanTime(value: string): string {
    return new Intl.DateTimeFormat('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(value));
  }

  function reopenScan(scan: RecentScan) {
    stopScan();
    payload = scan.payload;
    sendSuccess = scan.status === 'loaded';
    sendMessage = scan.message;
    scanStatusMessage = null;
    error = null;
  }

  function clearHash() {
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }

  function resetOrder() {
    stopScan();
    payload = null;
    error = null;
    sendSuccess = false;
    sendMessage = null;
    clearHash();
  }

  function tryLoad(raw: string): boolean {
    try {
      let value = raw.trim();
      const hashIndex = value.indexOf('#p=');
      if (hashIndex !== -1) value = value.slice(hashIndex + 3);
      else if (value.startsWith('p=')) value = value.slice(2);

      payload = decodeOrder(value);
      sendSuccess = false;
      sendMessage = null;
      error = null;
      return true;
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : 'Codice non valido';
      payload = null;
      return false;
    }
  }

  onMount(() => {
    cameraRequiresHttps = !window.isSecureContext;
    config = loadConfig();
    recentScans = loadRecentScans();
    if (window.location.hash.startsWith('#p=')) {
      tryLoad(window.location.hash.slice(3));
    }
    void checkConnection();
    if (!payload) void startScan();
    return () => stopScan();
  });

  async function startScan() {
    error = null;

    if (!window.isSecureContext) {
      error = 'La fotocamera richiede HTTPS. Apri la cassa da un indirizzo https://.';
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      error = 'Questo browser non supporta l\'accesso alla fotocamera.';
      return;
    }

    scanning = true;
    await tick();

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (!video) throw new Error('Video non disponibile');

      video.srcObject = stream;
      await video.play();
      loop();
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === 'NotAllowedError') {
        error = 'Permesso fotocamera negato. Abilitalo nelle impostazioni del browser e riprova.';
      } else if (scanError instanceof DOMException && scanError.name === 'NotFoundError') {
        error = 'Nessuna fotocamera disponibile su questo dispositivo.';
      } else {
        error = 'Impossibile avviare la fotocamera. Riprova.';
      }
      stopScan();
    }
  }

  function loop() {
    if (!scanning || !video || !canvas) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height);
        if (code?.data) {
          const now = Date.now();
          if (code.data === lastScannedCode && now - lastScannedAt < 5000) {
            rafId = requestAnimationFrame(loop);
            return;
          }
          lastScannedCode = code.data;
          lastScannedAt = now;
          void handleScannedCode(code.data);
          return;
        }
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  async function handleScannedCode(raw: string) {
    stopScan();
    scanStatusMessage = 'QR letto. Preparo l\'ordine…';
    if (!tryLoad(raw)) return;

    await tick();
    if (!payload) return;
    const loaded = await submitOrder();
    if (!loaded) {
      rememberScan(payload, 'failed', sendMessage ?? 'Da verificare manualmente.');
      scanStatusMessage = null;
      return;
    }

    rememberScan(payload, 'loaded', sendMessage ?? 'Ordine inviato alla cassa.');
    scanStatusMessage = sendMessage ?? 'Ordine inviato alla cassa.';
    resetOrder();
    scanStatusMessage = 'Ordine inviato alla cassa. Pronto per il prossimo QR.';
    await tick();
    await startScan();
  }

  function stopScan() {
    scanning = false;
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  const categories = $derived.by(() => {
    if (!payload) return [];

    const payloadLines = new Map(payload.l);
    const unknownLines: CashierLine[] = [];

    for (const [id] of payload.l) {
      if (!menuLines[id]) {
        unknownLines.push({ id, name: id, price: 0, qty: payloadLines.get(id) ?? 0, subtotal: 0, known: false });
      }
    }

    const ordered: CashierCategory[] = CASHIER_SECTIONS.flatMap((section) => {
      const sectionLines = section.itemIds.flatMap((id) => {
        const qty = payloadLines.get(id);
        const menuLine = menuLines[id];
        if (!qty || !menuLine) return [];
        return [{ id, name: menuLine.name, price: menuLine.price, qty, subtotal: menuLine.price * qty, known: true }];
      });
      if (!sectionLines.length) return [];
      return [{ id: section.id, label: section.label, lines: sectionLines }];
    });

    const orderedIds = new Set<string>(CASHIER_SECTIONS.flatMap((section) => section.itemIds));
    for (const [id, qty] of payload.l) {
      const menuLine = menuLines[id];
      if (menuLine && !orderedIds.has(id)) {
        unknownLines.push({ id, name: menuLine.name, price: menuLine.price, qty, subtotal: menuLine.price * qty, known: false });
      }
    }

    if (unknownLines.length) {
      ordered.push({ id: 'unknown', label: 'Articoli non riconosciuti', lines: unknownLines });
    }
    return ordered;
  });

  const lines = $derived(categories.flatMap((category) => category.lines));
  const hasUnknownLines = $derived(lines.some((line) => !line.known));

  const computedTotal = $derived.by(() => {
    if (!payload) return 0;
    const items = lines.reduce((sum, line) => sum + line.subtotal, 0);
    return items + MENU.coperto.perPersona * payload.p;
  });

  const payloadTotalMatches = $derived(
    payload !== null && Math.round(computedTotal * 100) === payload.t
  );

  const canSubmit = $derived(
    payload !== null &&
      payloadTotalMatches &&
      !hasUnknownLines &&
      !sending &&
      connectionState !== 'checking'
  );

  function persistConfig() {
    config.port = Number(config.port);
    saveConfig(config);
    connectionState = 'idle';
    connectionMessage = 'Configurazione salvata. Verifica la connessione.';
  }

  async function checkConnection(): Promise<boolean> {
    persistConfig();
    connectionState = 'checking';
    connectionMessage = 'Connessione alla cassa desktop…';

    try {
      const response = await fetch(`http://${config.host}:${config.port}/ping`);
      const data = (await response.json()) as { ok?: boolean; role?: string };
      if (!response.ok || !data.ok) {
        connectionState = 'failed';
        connectionMessage = `La cassa ha risposto con HTTP ${response.status}.`;
        return false;
      }
      connectionState = 'connected';
      connectionMessage = `Cassa raggiungibile su ${config.host}:${config.port}.`;
      return true;
    } catch {
      connectionState = 'failed';
      connectionMessage = `Impossibile raggiungere la cassa su ${config.host}:${config.port}. Verifica l'IP e che la cassa sia in esecuzione.`;
      return false;
    }
  }

  async function submitOrder(): Promise<boolean> {
    if (!payload) return false;

    sending = true;

    try {
      if (connectionState !== 'connected') {
        sendMessage = 'Verifica connessione alla cassa desktop…';
        const connected = await checkConnection();
        if (!connected) {
          sendMessage = connectionMessage;
          return false;
        }
      }

      sendMessage = 'Invio ordine alla cassa…';
      const response = await fetch(`http://${config.host}:${config.port}/pending-order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload })
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        sendMessage = data.error ?? `La cassa ha risposto con HTTP ${response.status}.`;
        return false;
      }
      sendSuccess = true;
      sendMessage = 'Ordine inviato alla cassa. Verifica e incasso in corso.';
      return true;
    } catch (err) {
      sendMessage = err instanceof Error ? err.message : 'Invio alla cassa non riuscito.';
      return false;
    } finally {
      sending = false;
    }
  }

  function confirmReset() {
    resetOrder();
  }
</script>

<header class="px-4 pt-4 pb-3 bg-leaf text-cream-50">
  <div class="max-w-2xl mx-auto flex items-center justify-between gap-3">
    <div class="text-left">
      <p class="uppercase tracking-wide text-sm opacity-80">Cassa</p>
      <h1 class="text-2xl font-bold">{payload ? 'Gestisci ordine' : 'Carica un ordine'}</h1>
    </div>
    <button
      type="button"
      onclick={() => (configOpen = !configOpen)}
      aria-expanded={configOpen}
      class="shrink-0 px-3 py-2 min-h-12 rounded-full border-2 border-cream-50 text-cream-50 font-bold flex items-center gap-2"
    >
      <span
        class="w-3 h-3 rounded-full"
        class:bg-green-300={connectionState === 'connected'}
        class:bg-amber-300={connectionState === 'idle' || connectionState === 'checking'}
        class:bg-red-300={connectionState === 'failed'}
        aria-hidden="true"
      ></span>
      <span class="text-sm">{connectionBadge}</span>
    </button>
  </div>
</header>

<div class="px-4 py-4 max-w-2xl mx-auto w-full">
  {#if configOpen}
    <section class="bg-white border-2 border-leaf rounded-xl p-4 mb-5" aria-labelledby="cassa-config">
      <div class="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 id="cassa-config" class="text-xl font-bold text-leaf">Configurazione cassa</h2>
          <p class="text-sm text-ink/75 mt-1">
            Salvata solo su questo dispositivo.
          </p>
        </div>
      </div>

      <div class="grid sm:grid-cols-2 gap-3 mt-3">
        <label class="font-semibold">
          IP cassa desktop
          <input
            bind:value={config.host}
            inputmode="url"
            placeholder="192.168.1.1"
            class="block w-full mt-1 px-3 py-2 min-h-12 border-2 border-leaf rounded-lg bg-cream-50"
          />
        </label>
        <label class="font-semibold">
          Porta
          <input
            bind:value={config.port}
            type="number"
            min="1"
            max="65535"
            class="block w-full mt-1 px-3 py-2 min-h-12 border-2 border-leaf rounded-lg bg-cream-50"
          />
        </label>
      </div>

      <div class="mt-3">
        <label class="font-semibold">
          Nome cassa
          <input
            bind:value={config.tillName}
            placeholder="Cassa telefono"
            class="block w-full mt-1 px-3 py-2 min-h-12 border-2 border-leaf rounded-lg bg-cream-50"
          />
        </label>
      </div>

      <div class="bg-amber-100 border border-amber-700 text-amber-950 rounded-lg px-3 py-3 mt-4">
        <p class="font-bold">Stesso Wi-Fi</p>
        <p class="text-sm mt-1">
          Il telefono e il PC della cassa devono essere collegati alla stessa rete locale.
        </p>
      </div>

      <div
        class="mt-4 rounded-lg px-3 py-3 font-semibold"
        class:bg-green-100={connectionState === 'connected'}
        class:text-green-900={connectionState === 'connected'}
        class:bg-red-100={connectionState === 'failed'}
        class:text-red-900={connectionState === 'failed'}
        class:bg-cream-100={connectionState === 'idle' || connectionState === 'checking'}
        role="status"
      >
        {connectionMessage}
      </div>

      <div class="grid sm:grid-cols-2 gap-3 mt-3">
        <button
          type="button"
          onclick={persistConfig}
          class="px-5 py-3 min-h-12 rounded-full border-2 border-leaf text-leaf font-bold"
        >
          Salva
        </button>
        <button
          type="button"
          onclick={checkConnection}
          disabled={connectionState === 'checking'}
          class="px-5 py-3 min-h-12 rounded-full bg-leaf text-white font-bold"
        >
          {connectionState === 'checking' ? 'Verifica…' : 'Verifica connessione'}
        </button>
      </div>
    </section>
  {/if}

  {#if !payload}
    <div class="flex flex-col gap-4">
      {#if cameraRequiresHttps}
        <div
          class="bg-amber-100 border-2 border-amber-700 text-amber-950 rounded-lg px-4 py-3"
          role="alert"
        >
          <p class="font-bold">La scansione non funziona su HTTP</p>
          <p class="mt-1">
            I browser dei telefoni consentono la fotocamera solo su HTTPS. Apri questa pagina da
            un indirizzo <strong>https://</strong>.
          </p>
        </div>
      {/if}

      {#if scanning}
        <div class="relative bg-black rounded-lg overflow-hidden">
          <video bind:this={video} class="w-full" muted playsinline></video>
          <canvas bind:this={canvas} class="hidden"></canvas>
        </div>
        <button
          type="button"
          onclick={stopScan}
          class="w-full px-6 py-3 min-h-12 rounded-full bg-cream-100 border-2 border-leaf text-leaf font-bold"
        >
          Annulla scansione
        </button>
      {:else if !error && !cameraRequiresHttps}
        <p class="bg-cream-100 text-leaf rounded-lg px-4 py-3 font-semibold" role="status">
          Avvio fotocamera…
        </p>
      {/if}

      {#if error}
        <p class="text-tomato font-semibold text-center" role="alert">{error}</p>
      {/if}

      {#if scanStatusMessage}
        <p class="bg-green-100 text-green-900 rounded-lg px-4 py-3 font-semibold" role="status">
          {scanStatusMessage}
        </p>
      {/if}

      {#if recentScans.length}
        <section class="bg-white border-2 border-leaf rounded-xl p-4">
          <div class="flex items-center justify-between gap-3 mb-3">
            <h2 class="text-lg font-bold text-leaf">Ultime scansioni</h2>
            <span class="text-sm font-semibold text-ink/65">{recentScans.length}</span>
          </div>
          <ul class="divide-y divide-cream-200">
            {#each recentScans as scan (scan.id)}
              <li class="py-3 first:pt-0 last:pb-0">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-bold tabular-nums">{formatScanTime(scan.scannedAt)}</span>
                      <span
                        class="px-2 py-1 rounded-full text-xs font-bold"
                        class:bg-green-100={scan.status === 'loaded'}
                        class:text-green-900={scan.status === 'loaded'}
                        class:bg-red-100={scan.status === 'failed'}
                        class:text-red-900={scan.status === 'failed'}
                      >
                        {scan.status === 'loaded' ? 'Inviato' : 'Verifica'}
                      </span>
                    </div>
                    <p class="font-semibold truncate">{scan.summary}</p>
                    <p class="text-sm text-ink/70">
                      {scan.payload.p} coperti · {formatEUR(scan.totalCents / 100)}
                    </p>
                    <p class="text-sm text-ink/60 truncate">{scan.message}</p>
                  </div>
                  <button
                    type="button"
                    onclick={() => reopenScan(scan)}
                    class="shrink-0 px-3 py-2 rounded-full border-2 border-leaf text-leaf font-bold"
                  >
                    Riapri
                  </button>
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  {:else}
    <div class="sticky top-0 z-10 bg-cream-50 pb-3">
      <div class="bg-cream-100 rounded-lg px-4 py-3">
        <div class="text-sm uppercase tracking-wide text-leaf font-semibold">Coperti</div>
        <div class="text-2xl font-bold text-ink">
          {payload.p} {payload.p === 1 ? 'persona' : 'persone'}
        </div>
      </div>
    </div>

    <section class="bg-white border-2 border-leaf rounded-xl p-4 mb-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-leaf">Invia alla cassa</h2>
          <p class="text-sm mt-1">
            {connectionState === 'connected'
              ? connectionMessage
              : 'L\'invio verificherà la connessione prima di procedere.'}
          </p>
        </div>
        <span
          class="w-4 h-4 rounded-full shrink-0"
          class:bg-green-600={connectionState === 'connected'}
          class:bg-red-600={connectionState === 'failed'}
          class:bg-amber-500={connectionState === 'idle' || connectionState === 'checking'}
          aria-hidden="true"
        ></span>
      </div>

      <div class="mt-4">
        <button
          type="button"
          onclick={submitOrder}
          disabled={!canSubmit}
          class="w-full px-6 py-4 min-h-14 rounded-full bg-tomato text-white text-lg font-bold disabled:bg-cream-200 disabled:text-ink/50"
        >
          {#if sending}
            Invio…
          {:else}
            Invia ordine alla cassa
          {/if}
        </button>
      </div>

      {#if sendMessage}
        <p
          class="mt-3 rounded-lg px-3 py-3 font-semibold"
          class:bg-green-100={sendSuccess}
          class:text-green-900={sendSuccess}
          class:bg-red-100={!sendSuccess && !sending}
          class:text-red-900={!sendSuccess && !sending}
          class:bg-cream-100={sending}
          role="status"
        >
          {sendMessage}
        </p>
      {/if}
    </section>

    <div class="bg-cream-100 border-l-4 border-leaf rounded-r-lg px-4 py-3 mb-4">
      <p class="font-bold">Inserimento manuale sempre disponibile</p>
      <p class="text-sm mt-1">
        Leggi le righe qui sotto e inseriscile nella cassa.
      </p>
    </div>

    <section class="mb-5">
      <h2 class="text-lg font-bold uppercase tracking-wide text-tomato mb-2">Coperto</h2>
      <div class="w-full flex items-center gap-3 px-3 py-4 text-left min-h-20 bg-cream-100 rounded-lg">
        <span class="text-3xl font-bold tabular-nums w-14 shrink-0 text-tomato">
          {payload.p}×
        </span>
        <span class="flex-1 min-w-0">
          <span class="block text-xl font-semibold text-ink leading-tight">Coperto</span>
          <span class="block text-sm text-leaf mt-1">
            {formatEUR(MENU.coperto.perPersona)} cad. ·
            {formatEUR(MENU.coperto.perPersona * payload.p)}
          </span>
        </span>
      </div>
    </section>

    {#each categories as category (category.id)}
      <section class="mb-5">
        <h2
          class="text-lg font-bold uppercase tracking-wide mb-2"
          class:text-tomato={category.id !== 'unknown'}
          class:text-red-800={category.id === 'unknown'}
        >
          {category.label}
        </h2>
        <ul class="bg-cream-100 rounded-lg divide-y divide-cream-200 overflow-hidden">
          {#each category.lines as line (line.id)}
            <li>
              <div
                class="w-full flex items-center gap-3 px-3 py-4 text-left min-h-20"
                class:bg-red-100={!line.known}
              >
                <span class="text-3xl font-bold tabular-nums w-14 shrink-0 text-tomato">
                  {line.qty}×
                </span>
                <span class="flex-1 min-w-0">
                  <span class="block text-xl font-semibold text-ink leading-tight">
                    {line.name}
                  </span>
                  {#if line.known}
                    <span class="block text-sm text-leaf mt-1">
                      {formatEUR(line.price)} cad. · {formatEUR(line.subtotal)}
                    </span>
                  {:else}
                    <span class="block text-sm text-red-800 mt-1">
                      Articolo assente dal menu della cassa
                    </span>
                  {/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <div class="bg-leaf text-cream-50 rounded-lg px-4 py-4 mb-4 flex items-center justify-between">
      <div class="text-xl font-semibold">Totale atteso</div>
      <div class="text-3xl font-bold tabular-nums">{formatEUR(computedTotal)}</div>
    </div>

    {#if !payloadTotalMatches}
      <p
        class="bg-red-100 border-2 border-red-700 text-red-900 rounded-lg px-4 py-3 font-semibold mb-4"
        role="alert"
      >
        Il totale mostrato al cliente ({formatEUR(payload.t / 100)}) non coincide con quello
        calcolato. Non completare l'ordine finché il menu non è stato verificato.
      </p>
    {/if}

    {#if hasUnknownLines}
      <p
        class="bg-red-100 border-2 border-red-700 text-red-900 rounded-lg px-4 py-3 font-semibold mb-4"
        role="alert"
      >
        Uno o più articoli non sono riconosciuti. Verificare il QR e il menu prima di procedere.
      </p>
    {/if}

    {#if sendSuccess}
      <button
        type="button"
        onclick={resetOrder}
        class="w-full px-6 py-4 min-h-14 rounded-full bg-tomato hover:bg-tomato-dark text-white text-xl font-bold mb-3"
      >
        Scansiona il prossimo
      </button>
    {/if}

    <button
      type="button"
      onclick={confirmReset}
      class="w-full px-6 py-3 min-h-12 rounded-full bg-cream-100 border-2 border-leaf text-leaf font-bold"
    >
      {sendSuccess ? 'Torna alla scansione' : 'Abbandona ordine'}
    </button>
  {/if}
</div>
