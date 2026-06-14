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

  const COVER_LINE_ID = '__cover__';

  let payload = $state<Payload | null>(null);
  let error = $state<string | null>(null);
  let pasted = $state('');
  let scanning = $state(false);
  let cameraRequiresHttps = $state(false);
  let checkedLines = $state<Record<string, boolean>>({});
  let totalMatches = $state(false);

  let video = $state<HTMLVideoElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let stream: MediaStream | null = null;
  let rafId = 0;

  const menuLines = $derived.by(() => {
    const index: Record<string, CashierLine & { categoryId: string; categoryLabel: string }> = {};
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
                known: true,
                categoryId: category.id,
                categoryLabel: category.label
              };
            }
          } else {
            index[item.id] = {
              id: item.id,
              name: item.name,
              price: item.price,
              qty: 0,
              subtotal: 0,
              known: true,
              categoryId: category.id,
              categoryLabel: category.label
            };
          }
        }
      }
    }
    return index;
  });

  function clearHash() {
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }

  function resetOrder() {
    stopScan();
    payload = null;
    pasted = '';
    error = null;
    checkedLines = {};
    totalMatches = false;
    clearHash();
  }

  function tryLoad(raw: string) {
    try {
      let value = raw.trim();
      const hashIndex = value.indexOf('#p=');
      if (hashIndex !== -1) value = value.slice(hashIndex + 3);
      else if (value.startsWith('p=')) value = value.slice(2);

      payload = decodeOrder(value);
      checkedLines = {};
      totalMatches = false;
      error = null;
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : 'Codice non valido';
      payload = null;
    }
  }

  onMount(() => {
    cameraRequiresHttps = !window.isSecureContext;
    if (window.location.hash.startsWith('#p=')) {
      tryLoad(window.location.hash.slice(3));
    }
    return () => stopScan();
  });

  async function startScan() {
    error = null;

    if (!window.isSecureContext) {
      error =
        'La fotocamera richiede HTTPS. Apri la cassa da un indirizzo https:// oppure usa il caricamento manuale qui sotto.';
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      error = 'Questo browser non supporta l’accesso alla fotocamera.';
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
        error =
          'Permesso fotocamera negato. Abilitalo nelle impostazioni del browser e riprova.';
      } else if (scanError instanceof DOMException && scanError.name === 'NotFoundError') {
        error = 'Nessuna fotocamera disponibile su questo dispositivo.';
      } else {
        error = 'Impossibile avviare la fotocamera. Riprova o usa il caricamento manuale.';
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
          tryLoad(code.data);
          stopScan();
          return;
        }
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function stopScan() {
    scanning = false;
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function toggleLine(id: string) {
    checkedLines[id] = !checkedLines[id];
  }

  const categories = $derived.by(() => {
    if (!payload) return [];

    const categoryMap = new Map<string, CashierCategory>();
    const unknownLines: CashierLine[] = [];

    for (const [id, qty] of payload.l) {
      const menuLine = menuLines[id];
      if (!menuLine) {
        unknownLines.push({ id, name: id, price: 0, qty, subtotal: 0, known: false });
        continue;
      }

      let category = categoryMap.get(menuLine.categoryId);
      if (!category) {
        category = {
          id: menuLine.categoryId,
          label: menuLine.categoryLabel,
          lines: []
        };
        categoryMap.set(menuLine.categoryId, category);
      }
      category.lines.push({
        id,
        name: menuLine.name,
        price: menuLine.price,
        qty,
        subtotal: menuLine.price * qty,
        known: true
      });
    }

    const ordered = MENU.categories.flatMap((category) => {
      const cashierCategory = categoryMap.get(category.id);
      return cashierCategory ? [cashierCategory] : [];
    });

    if (unknownLines.length) {
      ordered.push({ id: 'unknown', label: 'Articoli non riconosciuti', lines: unknownLines });
    }
    return ordered;
  });

  const lines = $derived(categories.flatMap((category) => category.lines));
  const lineIds = $derived([...lines.map((line) => line.id), COVER_LINE_ID]);
  const completedCount = $derived(lineIds.filter((id) => checkedLines[id]).length);
  const hasUnknownLines = $derived(lines.some((line) => !line.known));
  const allLinesChecked = $derived(lineIds.length > 0 && completedCount === lineIds.length);

  const computedTotal = $derived.by(() => {
    if (!payload) return 0;
    const items = lines.reduce((sum, line) => sum + line.subtotal, 0);
    return items + MENU.coperto.perPersona * payload.p;
  });

  const payloadTotalMatches = $derived(
    payload !== null && Math.round(computedTotal * 100) === payload.t
  );
  const canComplete = $derived(
    allLinesChecked && totalMatches && payloadTotalMatches && !hasUnknownLines
  );

  function completeOrder() {
    if (!canComplete) return;
    resetOrder();
  }

  function confirmReset() {
    if (confirm('Abbandonare questo ordine e tornare alla scansione?')) resetOrder();
  }
</script>

<header class="px-4 pt-4 pb-3 text-center bg-leaf text-cream-50">
  <p class="uppercase tracking-wide text-sm opacity-80">Cassa</p>
  <h1 class="text-2xl font-bold">{payload ? 'Inserisci in MisterPOS' : 'Carica un ordine'}</h1>
</header>

<div class="px-4 py-4 max-w-2xl mx-auto w-full">
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
            un indirizzo <strong>https://</strong> oppure incolla il contenuto del QR qui sotto.
          </p>
        </div>
      {/if}

      {#if !scanning}
        <button
          type="button"
          onclick={startScan}
          disabled={cameraRequiresHttps}
          class="w-full px-6 py-4 min-h-14 rounded-full bg-tomato hover:bg-tomato-dark text-white text-xl font-bold"
          class:opacity-50={cameraRequiresHttps}
          class:cursor-not-allowed={cameraRequiresHttps}
        >
          Scansiona QR
        </button>
      {:else}
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
      {/if}

      <div class="flex items-center gap-2 my-2">
        <div class="flex-1 h-px bg-cream-200"></div>
        <span class="text-sm text-ink/70 uppercase">oppure</span>
        <div class="flex-1 h-px bg-cream-200"></div>
      </div>

      <label for="payload-input" class="text-lg font-semibold text-ink">
        Incolla il contenuto o l'URL del QR
      </label>
      <textarea
        id="payload-input"
        bind:value={pasted}
        rows="3"
        class="w-full p-3 border-2 border-leaf rounded-lg text-base font-mono bg-white"
        placeholder="es. https://.../cassa#p=..."
      ></textarea>
      <button
        type="button"
        onclick={() => tryLoad(pasted)}
        class="w-full px-6 py-3 min-h-12 rounded-full bg-leaf text-cream-50 text-lg font-bold"
      >
        Carica ordine
      </button>

      {#if error}
        <p class="text-tomato font-semibold text-center" role="alert">{error}</p>
      {/if}
    </div>
  {:else}
    <div class="sticky top-0 z-10 bg-cream-50 pb-3">
      <div class="bg-cream-100 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <div class="text-sm uppercase tracking-wide text-leaf font-semibold">Coperti</div>
          <div class="text-2xl font-bold text-ink">
            {payload.p} {payload.p === 1 ? 'persona' : 'persone'}
          </div>
        </div>
        <div class="text-right">
          <div class="text-sm uppercase tracking-wide text-leaf font-semibold">Inseriti</div>
          <div class="text-2xl font-bold tabular-nums text-ink">
            {completedCount}/{lineIds.length}
          </div>
        </div>
      </div>
    </div>

    <p class="text-ink/80 mb-4">Tocca ogni riga dopo averla inserita in MisterPOS.</p>

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
              <button
                type="button"
                onclick={() => toggleLine(line.id)}
                disabled={!line.known}
                aria-pressed={checkedLines[line.id] ?? false}
                class="w-full flex items-center gap-3 px-3 py-4 text-left min-h-20 disabled:cursor-not-allowed"
                class:bg-green-100={checkedLines[line.id]}
                class:opacity-60={checkedLines[line.id]}
                class:bg-red-100={!line.known}
              >
                <span
                  class="w-11 h-11 shrink-0 rounded-lg border-2 flex items-center justify-center text-2xl font-bold"
                  class:bg-green-700={checkedLines[line.id]}
                  class:border-green-700={checkedLines[line.id]}
                  class:text-white={checkedLines[line.id]}
                  class:border-leaf={!checkedLines[line.id] && line.known}
                  class:text-leaf={!checkedLines[line.id] && line.known}
                  class:border-red-700={!line.known}
                  class:text-red-800={!line.known}
                >
                  {checkedLines[line.id] ? '✓' : line.known ? '' : '!'}
                </span>
                <span class="text-3xl font-bold tabular-nums w-14 shrink-0 text-tomato">
                  {line.qty}×
                </span>
                <span class="flex-1 min-w-0">
                  <span
                    class="block text-xl font-semibold text-ink leading-tight"
                    class:line-through={checkedLines[line.id]}
                  >
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
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <section class="mb-5">
      <h2 class="text-lg font-bold uppercase tracking-wide text-tomato mb-2">Coperto</h2>
      <button
        type="button"
        onclick={() => toggleLine(COVER_LINE_ID)}
        aria-pressed={checkedLines[COVER_LINE_ID] ?? false}
        class="w-full flex items-center gap-3 px-3 py-4 text-left min-h-20 bg-cream-100 rounded-lg"
        class:bg-green-100={checkedLines[COVER_LINE_ID]}
        class:opacity-60={checkedLines[COVER_LINE_ID]}
      >
        <span
          class="w-11 h-11 shrink-0 rounded-lg border-2 flex items-center justify-center text-2xl font-bold"
          class:bg-green-700={checkedLines[COVER_LINE_ID]}
          class:border-green-700={checkedLines[COVER_LINE_ID]}
          class:text-white={checkedLines[COVER_LINE_ID]}
          class:border-leaf={!checkedLines[COVER_LINE_ID]}
        >
          {checkedLines[COVER_LINE_ID] ? '✓' : ''}
        </span>
        <span class="text-3xl font-bold tabular-nums w-14 shrink-0 text-tomato">
          {payload.p}×
        </span>
        <span class="flex-1 min-w-0">
          <span
            class="block text-xl font-semibold text-ink leading-tight"
            class:line-through={checkedLines[COVER_LINE_ID]}
          >
            Pane e coperto
          </span>
          <span class="block text-sm text-leaf mt-1">
            {formatEUR(MENU.coperto.perPersona)} cad. ·
            {formatEUR(MENU.coperto.perPersona * payload.p)}
          </span>
        </span>
      </button>
    </section>

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

    <label
      class="flex items-center gap-3 bg-white border-2 border-leaf rounded-lg px-4 py-4 mb-4"
      class:opacity-50={!allLinesChecked || !payloadTotalMatches || hasUnknownLines}
    >
      <input
        type="checkbox"
        bind:checked={totalMatches}
        disabled={!allLinesChecked || !payloadTotalMatches || hasUnknownLines}
        class="w-7 h-7 shrink-0 accent-green-700"
      />
      <span class="text-lg font-bold text-ink">
        Il totale in MisterPOS corrisponde a {formatEUR(computedTotal)}
      </span>
    </label>

    <button
      type="button"
      onclick={completeOrder}
      disabled={!canComplete}
      class="w-full px-6 py-4 min-h-14 rounded-full bg-tomato hover:bg-tomato-dark disabled:bg-cream-200 disabled:text-ink/50 text-white text-xl font-bold mb-3"
    >
      Completa e scansiona il prossimo
    </button>

    <button
      type="button"
      onclick={confirmReset}
      class="w-full px-6 py-3 min-h-12 rounded-full bg-cream-100 border-2 border-leaf text-leaf font-bold"
    >
      Abbandona ordine
    </button>
  {/if}
</div>
