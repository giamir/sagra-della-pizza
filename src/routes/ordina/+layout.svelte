<script lang="ts">
  import RunningTotal from '$lib/components/RunningTotal.svelte';
  import SectionNav from '$lib/components/SectionNav.svelte';
  import { page } from '$app/state';

  const order = [
    '/ordina/persone',
    '/ordina/bevande',
    '/ordina/antipasti',
    '/ordina/pizze',
    '/ordina/griglia',
    '/ordina/contorni',
    '/ordina/bar',
    '/ordina/riepilogo'
  ];

  const nextHref = $derived.by(() => {
    const idx = order.indexOf(page.url.pathname);
    if (idx === -1 || idx === order.length - 1) return undefined;
    return order[idx + 1];
  });
  const nextLabel = $derived(
    page.url.pathname === '/ordina/bar' ? 'Vai al riepilogo' : 'Avanti'
  );

  let { children } = $props();
</script>

<SectionNav />

<div class="flex-1 flex flex-col">
  {@render children()}
</div>

{#if nextHref}
  <RunningTotal {nextHref} {nextLabel} />
{/if}
