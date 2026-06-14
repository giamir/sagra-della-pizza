<script lang="ts">
  import { dec, getQty, inc } from '$lib/stores/order.svelte';
  import type { MenuItem } from '$lib/types';
  import { formatEUR } from '$lib/utils/currency';

  type Props = { item: MenuItem };
  let { item }: Props = $props();
</script>

<div class="py-3 border-b border-cream-200 last:border-b-0">
  <div class="flex items-start gap-3">
    <div class="flex-1 min-w-0">
      <div class="text-xl font-semibold text-ink leading-tight">{item.name}</div>
      {#if item.description}
        <div class="mt-1 text-base text-ink/75 leading-snug">{item.description}</div>
      {/if}
      <div class="text-lg text-leaf font-medium">{formatEUR(item.price)}</div>
    </div>
    {#if !item.variants?.length}
      {@const qty = getQty(item.id)}
      <div
        class="flex items-center gap-2 shrink-0"
        role="group"
        aria-label={`Quantità di ${item.name}`}
      >
        <button
          type="button"
          onclick={() => dec(item.id)}
          disabled={qty === 0}
          aria-label={`Diminuisci quantità di ${item.name}`}
          class="w-12 h-12 rounded-full bg-cream-100 hover:bg-cream-200 disabled:bg-cream-100 border-2 border-leaf text-leaf text-2xl font-bold flex items-center justify-center"
        >
          −
        </button>
        <div
          class="w-10 text-center text-2xl font-bold tabular-nums text-ink"
          aria-live="polite"
          aria-atomic="true"
        >
          {qty}
        </div>
        <button
          type="button"
          onclick={() => inc(item.id)}
          aria-label={`Aumenta quantità di ${item.name}`}
          class="w-12 h-12 rounded-full bg-tomato hover:bg-tomato-dark text-white text-2xl font-bold flex items-center justify-center"
        >
          +
        </button>
      </div>
    {/if}
  </div>

  {#if item.variants?.length}
    <div class="mt-3 ml-3 border-l-4 border-cream-200 pl-3">
      {#each item.variants as variant (variant.id)}
        {@const qty = getQty(variant.id)}
        <div class="flex items-center gap-3 py-2">
          <div class="flex-1 text-lg font-semibold text-ink">{variant.label}</div>
          <div
            class="flex items-center gap-2 shrink-0"
            role="group"
            aria-label={`Quantità di ${item.name}, cottura ${variant.label}`}
          >
            <button
              type="button"
              onclick={() => dec(variant.id)}
              disabled={qty === 0}
              aria-label={`Diminuisci ${item.name}, cottura ${variant.label}`}
              class="w-11 h-11 rounded-full bg-cream-100 disabled:bg-cream-100 border-2 border-leaf text-leaf text-xl font-bold"
            >
              −
            </button>
            <div
              class="w-9 text-center text-xl font-bold tabular-nums text-ink"
              aria-live="polite"
              aria-atomic="true"
            >
              {qty}
            </div>
            <button
              type="button"
              onclick={() => inc(variant.id)}
              aria-label={`Aumenta ${item.name}, cottura ${variant.label}`}
              class="w-11 h-11 rounded-full bg-tomato text-white text-xl font-bold"
            >
              +
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
