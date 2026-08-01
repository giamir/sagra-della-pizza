<script lang="ts">
  import RunningTotal from '$lib/components/RunningTotal.svelte';
  import SectionNav from '$lib/components/SectionNav.svelte';
  import { FIRST_STEP_HREF, ORDER_STEPS } from '$lib/config/steps';
  import { MENU } from '$lib/stores/order.svelte';
  import { page } from '$app/state';

  const order = ORDER_STEPS.map((s) => s.href);
  const lastCategoryHref =
    MENU.categories.length > 0
      ? `/ordina/${MENU.categories[MENU.categories.length - 1].id}`
      : FIRST_STEP_HREF;

  const nextHref = $derived.by(() => {
    const idx = order.indexOf(page.url.pathname);
    if (idx === -1 || idx === order.length - 1) return undefined;
    return order[idx + 1];
  });
  const nextLabel = $derived(
    page.url.pathname === lastCategoryHref ? 'Vai al riepilogo' : 'Avanti'
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
