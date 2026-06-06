<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { count, order, total } from '$lib/stores/order.svelte';
  import { formatEUR } from '$lib/utils/currency';
  import { encodeOrder, shortCode } from '$lib/utils/payload';
  import QRCode from 'qrcode';

  let canvasEl = $state<HTMLCanvasElement | null>(null);

  const t = $derived(total());
  const payload = $derived(encodeOrder(order, t));
  const code = $derived(shortCode(payload));
  const url = $derived.by(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/cassa#p=${payload}`;
  });

  $effect(() => {
    if (!canvasEl || !url) return;
    QRCode.toCanvas(canvasEl, url, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1f3a2a', light: '#ffffff' }
    }).catch(() => {});
  });

  $effect(() => {
    if (count() === 0) goto('/ordina/riepilogo');
  });
</script>

<div class="flex-1 flex flex-col items-center justify-start px-4 py-6 max-w-md mx-auto w-full">
  <p class="text-tomato uppercase tracking-wide font-semibold">Mostra alla cassa</p>
  <h1 class="text-3xl font-bold text-leaf mt-1 text-center">Il tuo ordine è pronto</h1>

  <div class="mt-4 text-center">
    <div class="text-sm text-ink/70 uppercase tracking-wide">Totale</div>
    <div class="text-4xl font-bold text-ink tabular-nums">{formatEUR(t)}</div>
  </div>

  <div class="mt-6 bg-white rounded-2xl p-4 shadow-xl border-4 border-leaf">
    <canvas bind:this={canvasEl} aria-label="Codice QR del tuo ordine"></canvas>
  </div>

  <div class="mt-6 text-center">
    <div class="text-sm text-ink/70 uppercase tracking-wide">Codice</div>
    <div
      class="text-4xl font-bold font-mono tracking-widest text-leaf bg-cream-100 rounded-lg px-4 py-2 mt-1"
    >
      {code}
    </div>
    <p class="text-sm text-ink/80 mt-2">
      Se la cassa non può scansionare, comunica questo codice.
    </p>
  </div>

  <div class="mt-8 flex flex-col gap-3 w-full">
    <a
      href="/ordina/riepilogo"
      class="block text-center w-full px-6 py-4 min-h-14 rounded-full bg-cream-100 hover:bg-cream-200 text-leaf text-lg font-bold border-2 border-leaf"
    >
      ← Torna al riepilogo
    </a>
  </div>
</div>
