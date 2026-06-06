<script lang="ts">
  import { MENU } from '$lib/stores/order.svelte';
  import { formatEUR } from '$lib/utils/currency';
  import { decodeOrder } from '$lib/utils/payload';
  import { buildPriceIndex } from '$lib/utils/pricing';
  import type { Payload } from '$lib/types';
  import jsQR from 'jsqr';
  import { onMount } from 'svelte';

  let payload = $state<Payload | null>(null);
  let error = $state<string | null>(null);
  let pasted = $state('');
  let scanning = $state(false);
  let confirmed = $state(false);

  let video = $state<HTMLVideoElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let stream: MediaStream | null = null;
  let rafId = 0;

  const priceIdx = $derived(buildPriceIndex(MENU));

  function tryLoad(raw: string) {
    try {
      let s = raw.trim();
      const hashIdx = s.indexOf('#p=');
      if (hashIdx !== -1) s = s.slice(hashIdx + 3);
      else if (s.startsWith('p=')) s = s.slice(2);
      payload = decodeOrder(s);
      error = null;
      confirmed = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Codice non valido';
      payload = null;
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#p=')) {
      tryLoad(window.location.hash.slice(3));
    }
    return () => stopScan();
  });

  async function startScan() {
    error = null;
    scanning = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (video) {
        video.srcObject = stream;
        await video.play();
        loop();
      }
    } catch (e) {
      error = 'Impossibile accedere alla fotocamera.';
      scanning = false;
    }
  }

  function loop() {
    if (!scanning || !video || !canvas) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
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
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  const lines = $derived.by(() => {
    if (!payload) return [];
    return payload.l.map(([id, qty]) => {
      const item = priceIdx[id];
      return {
        id,
        name: item?.name ?? id,
        price: item?.price ?? 0,
        qty,
        subtotal: (item?.price ?? 0) * qty
      };
    });
  });

  const computedTotal = $derived.by(() => {
    if (!payload) return 0;
    const items = lines.reduce((s, l) => s + l.subtotal, 0);
    return items + MENU.coperto.perPersona * payload.p;
  });
</script>

<header class="px-4 pt-4 pb-3 text-center bg-leaf text-cream-50">
  <p class="uppercase tracking-wide text-sm opacity-80">Cassa</p>
  <h1 class="text-2xl font-bold">Carica un ordine</h1>
</header>

<div class="px-4 py-4 max-w-2xl mx-auto w-full">
  {#if !payload}
    <div class="flex flex-col gap-4">
      {#if !scanning}
        <button
          type="button"
          onclick={startScan}
          class="w-full px-6 py-4 min-h-14 rounded-full bg-tomato hover:bg-tomato-dark text-white text-xl font-bold"
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
        Incolla il codice o l'URL del QR
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
    <div class="bg-cream-100 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
      <div>
        <div class="text-sm uppercase tracking-wide text-leaf font-semibold">Tavolo</div>
        <div class="text-2xl font-bold text-ink">
          {payload.p} {payload.p === 1 ? 'persona' : 'persone'}
        </div>
      </div>
    </div>

    <ul class="bg-cream-100 rounded-lg divide-y divide-cream-200 mb-4">
      {#each lines as line (line.id)}
        <li class="flex items-center gap-3 px-3 py-3">
          <div class="text-2xl font-bold tabular-nums w-10 text-tomato">{line.qty}×</div>
          <div class="flex-1 min-w-0">
            <div class="text-lg font-semibold text-ink leading-tight">{line.name}</div>
            <div class="text-sm text-leaf">{formatEUR(line.price)} cad.</div>
          </div>
          <div class="text-lg font-bold tabular-nums">{formatEUR(line.subtotal)}</div>
        </li>
      {/each}
      <li class="flex items-center gap-3 px-3 py-3">
        <div class="text-2xl font-bold tabular-nums w-10 text-tomato">{payload.p}×</div>
        <div class="flex-1 min-w-0">
          <div class="text-lg font-semibold text-ink leading-tight">Pane e coperto</div>
          <div class="text-sm text-leaf">{formatEUR(MENU.coperto.perPersona)} cad.</div>
        </div>
        <div class="text-lg font-bold tabular-nums">
          {formatEUR(MENU.coperto.perPersona * payload.p)}
        </div>
      </li>
    </ul>

    <div class="bg-leaf text-cream-50 rounded-lg px-4 py-4 mb-4 flex items-center justify-between">
      <div class="text-xl font-semibold">Totale</div>
      <div class="text-3xl font-bold tabular-nums">{formatEUR(computedTotal)}</div>
    </div>

    {#if Math.round(computedTotal * 100) !== payload.t}
      <p class="text-tomato font-semibold text-center mb-4" role="alert">
        ⚠️ Il totale del cliente ({formatEUR(payload.t / 100)}) non coincide con quello calcolato.
        Verificare il menu.
      </p>
    {/if}

    {#if confirmed}
      <div
        class="bg-green-100 border-2 border-green-700 text-green-900 rounded-lg px-4 py-4 text-center text-xl font-bold mb-4"
        role="status"
      >
        ✓ Ordine confermato
      </div>
    {:else}
      <button
        type="button"
        onclick={() => (confirmed = true)}
        class="w-full px-6 py-4 min-h-14 rounded-full bg-tomato hover:bg-tomato-dark text-white text-xl font-bold mb-3"
      >
        Conferma ordine
      </button>
    {/if}

    <button
      type="button"
      onclick={() => {
        payload = null;
        pasted = '';
        confirmed = false;
      }}
      class="w-full px-6 py-3 min-h-12 rounded-full bg-cream-100 border-2 border-leaf text-leaf font-bold"
    >
      Nuovo ordine
    </button>
  {/if}
</div>
