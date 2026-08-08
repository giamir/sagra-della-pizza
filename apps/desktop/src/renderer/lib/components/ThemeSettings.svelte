<script lang="ts">
  import { ZoomIn, ZoomOut } from 'lucide-svelte';
  import { savedAccent, setAccent, tenantDefaultAccent } from '$lib/tenant-theme';
  import { zoom, zoomIn, zoomOut, resetZoom } from '$lib/zoom.svelte';

  let { onClose }: { onClose: () => void } = $props();

  const defaultAccent = tenantDefaultAccent() ?? '#2c5e3f';
  let accent = $state(savedAccent() ?? tenantDefaultAccent() ?? '#2c5e3f');

  const isDefaultAccent = $derived(accent.toLowerCase() === defaultAccent.toLowerCase());
  const shortcutKey = /mac/i.test(navigator.platform) ? 'Cmd' : 'Ctrl';

  // Live preview while picking; the choice is persisted right away so the till
  // keeps it after a restart (same per-machine scope as the light/dark theme).
  function pickAccent(color: string) {
    accent = color;
    setAccent(color);
  }

  function resetAccent() {
    accent = defaultAccent;
    setAccent(null);
  }

  function handleBackdrop(e: MouseEvent) {
    if ((e.target as Element) === (e.currentTarget as Element)) onClose();
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Aspetto"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
  onclick={handleBackdrop}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="bg-white dark:bg-[#20242c] rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4 p-6 flex flex-col gap-5">
    <div class="flex items-center justify-between">
      <h2 class="font-bold text-lg text-gray-900">Aspetto</h2>
      <button type="button" onclick={onClose} class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
    </div>

    <!-- Accent colour -->
    <section class="flex flex-col gap-2">
      <span class="text-sm font-semibold text-gray-700">Colore accento</span>
      <div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <input
          type="color"
          value={accent}
          oninput={(e) => pickAccent(e.currentTarget.value)}
          aria-label="Scegli colore accento"
          class="w-12 h-10 rounded-lg border border-gray-300 bg-white dark:bg-[#20242c] cursor-pointer p-1"
        />
        <div class="min-w-0 flex-1">
          <p class="font-mono text-sm font-bold text-gray-900 uppercase">{accent}</p>
          <p class="text-xs font-semibold text-gray-500">Pulsanti, intestazione e selezioni di questa cassa.</p>
        </div>
        <button
          type="button"
          onclick={resetAccent}
          disabled={isDefaultAccent}
          class="shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 bg-white dark:bg-[#20242c] text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          Ripristina
        </button>
      </div>
    </section>

    <!-- Zoom -->
    <section class="flex flex-col gap-2">
      <span class="text-sm font-semibold text-gray-700">Zoom interfaccia</span>
      <div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <button
          type="button"
          onclick={zoomOut}
          aria-label="Riduci zoom"
          class="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-300 bg-white dark:bg-[#20242c] text-gray-700 hover:bg-gray-100"
        >
          <ZoomOut size={18} />
        </button>
        <p class="w-16 text-center font-mono text-sm font-bold text-gray-900">{Math.round(zoom.factor * 100)}%</p>
        <button
          type="button"
          onclick={zoomIn}
          aria-label="Aumenta zoom"
          class="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-300 bg-white dark:bg-[#20242c] text-gray-700 hover:bg-gray-100"
        >
          <ZoomIn size={18} />
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold text-gray-500">Scorciatoie: {shortcutKey} + / {shortcutKey} − / {shortcutKey} 0</p>
        </div>
        <button
          type="button"
          onclick={resetZoom}
          disabled={zoom.factor === 1}
          class="shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 bg-white dark:bg-[#20242c] text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          100%
        </button>
      </div>
    </section>

    <div class="flex justify-end pt-1">
      <button
        type="button"
        onclick={onClose}
        class="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-bold hover:bg-green-800"
      >
        Chiudi
      </button>
    </div>
  </div>
</div>
