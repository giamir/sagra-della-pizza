<script lang="ts">
  import { dec, getQty, inc } from '$lib/stores/order.svelte';
  import { formatEUR } from '$lib/utils/currency';

  type Props = { id: string; name: string; price: number };
  let { id, name, price }: Props = $props();

  const qty = $derived(getQty(id));
</script>

<div class="flex items-center gap-3 py-3 border-b border-cream-200 last:border-b-0">
  <div class="flex-1 min-w-0">
    <div class="text-xl font-semibold text-ink leading-tight">{name}</div>
    <div class="text-lg text-leaf font-medium">{formatEUR(price)}</div>
  </div>
  <div class="flex items-center gap-2 shrink-0" role="group" aria-label={`Quantità di ${name}`}>
    <button
      type="button"
      onclick={() => dec(id)}
      disabled={qty === 0}
      aria-label={`Diminuisci quantità di ${name}`}
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
      onclick={() => inc(id)}
      aria-label={`Aumenta quantità di ${name}`}
      class="w-12 h-12 rounded-full bg-tomato hover:bg-tomato-dark text-white text-2xl font-bold flex items-center justify-center"
    >
      +
    </button>
  </div>
</div>
