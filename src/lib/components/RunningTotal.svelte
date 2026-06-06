<script lang="ts">
  import { count, total } from '$lib/stores/order.svelte';
  import { formatEUR } from '$lib/utils/currency';

  type Props = { nextHref?: string; nextLabel?: string };
  let { nextHref, nextLabel = 'Avanti' }: Props = $props();

  const t = $derived(total());
  const c = $derived(count());
</script>

<div
  class="sticky bottom-0 left-0 right-0 bg-leaf text-cream-50 border-t-4 border-leaf-dark shadow-[0_-4px_12px_rgba(0,0,0,0.15)]"
  role="status"
  aria-live="polite"
>
  <div class="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
    <div class="flex-1 min-w-0">
      <div class="text-sm uppercase tracking-wide opacity-80">Totale</div>
      <div class="text-3xl font-bold tabular-nums">{formatEUR(t)}</div>
      <div class="text-xs opacity-80">{c} {c === 1 ? 'piatto' : 'piatti'}</div>
    </div>
    {#if nextHref}
      <a
        href={nextHref}
        class="inline-flex items-center justify-center px-6 py-3 min-h-14 rounded-full bg-tomato hover:bg-tomato-dark text-white text-lg font-bold shadow-md"
      >
        {nextLabel} →
      </a>
    {/if}
  </div>
</div>
