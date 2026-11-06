<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';
  import type { MenuItem } from '@sagra/shared/types';

  // A chooser presents several real items (each with its own price and scorte)
  // behind a single till button — e.g. Acqua → 500 ml / 1 L, Estathè → Pesca / Limone.
  let {
    item,
    choices,
    onSelect,
    onClose
  }: {
    item: MenuItem;
    choices: Array<{ id: string; name: string; price: number; remaining: number; soldOut: boolean }>;
    onSelect: (choiceId: string) => void;
    onClose: () => void;
  } = $props();

  // Long choosers (e.g. Bevuta's cocktails) spread across columns so they use
  // the landscape till screen instead of scrolling one long list.
  const columns = $derived(choices.length > 8 ? 3 : choices.length > 4 ? 2 : 1);
</script>

<!-- Backdrop -->
<div
  role="dialog"
  aria-modal="true"
  aria-label="Scegli opzione"
  tabindex="-1"
  class="absolute inset-0 z-30 bg-black/60 flex items-center justify-center"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div
    class="bg-white dark:bg-[#20242c] rounded-2xl shadow-2xl p-6 max-w-[90vw] max-h-[90vh] overflow-y-auto {columns === 3
      ? 'w-[52rem]'
      : columns === 2
        ? 'w-[36rem]'
        : 'w-80'}"
  >
    <h2 class="text-lg font-bold text-gray-900 mb-1">{item.name}</h2>
    {#if item.description}
      <p class="text-sm text-gray-500 mb-1">{item.description}</p>
    {/if}
    <p class="text-sm font-semibold text-gray-600 mb-3">Scegli l'opzione</p>
    <div class="grid gap-2 {columns === 3 ? 'grid-cols-3' : columns === 2 ? 'grid-cols-2' : ''}">
      {#each choices as choice}
        <button
          type="button"
          disabled={choice.soldOut}
          onclick={() => onSelect(choice.id)}
          class="w-full py-3 px-4 rounded-xl border-2 border-gray-200 enabled:hover:border-green-700 enabled:hover:bg-green-50 text-left font-semibold text-gray-900 transition-colors flex items-center justify-between gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span class="flex flex-col">
            <span>{choice.name}</span>
            {#if choice.soldOut}
              <span class="text-xs font-normal text-gray-400">Esaurito</span>
            {:else if choice.remaining >= 0}
              <span class="text-xs font-normal text-amber-700">{choice.remaining} rimasti</span>
            {/if}
          </span>
          <span class="text-sm font-bold text-gray-600 whitespace-nowrap">{formatEUR(choice.price)}</span>
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
