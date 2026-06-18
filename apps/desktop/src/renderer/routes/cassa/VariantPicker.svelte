<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';
  import type { MenuItem } from '@sagra/shared/types';

  let {
    item,
    onSelect,
    onClose
  }: {
    item: MenuItem;
    onSelect: (variantId: string) => void;
    onClose: () => void;
  } = $props();
</script>

<!-- Backdrop -->
<div
  role="dialog"
  aria-modal="true"
  aria-label="Scegli variante"
  tabindex="-1"
  class="absolute inset-0 z-30 bg-black/60 flex items-center justify-center"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="bg-white rounded-2xl shadow-2xl p-6 w-80 max-w-[90vw]">
    <h2 class="text-lg font-bold text-gray-900 mb-1">{item.name}</h2>
    {#if item.description}
      <p class="text-sm text-gray-500 mb-4">{item.description}</p>
    {/if}
    <p class="text-sm font-semibold text-gray-600 mb-3">Scegli la variante · {formatEUR(item.price)}</p>
    <div class="space-y-2">
      {#each item.variants ?? [] as variant}
        <button
          type="button"
          onclick={() => onSelect(variant.id)}
          class="w-full py-3 px-4 rounded-xl border-2 border-gray-200 hover:border-green-700 hover:bg-green-50 text-left font-semibold text-gray-900 transition-colors"
        >
          {variant.label}
        </button>
      {/each}
    </div>
    <button
      type="button"
      onclick={onClose}
      class="mt-4 w-full py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50"
    >
      Annulla
    </button>
  </div>
</div>
