<script lang="ts">
  import { goto } from '$app/navigation';
  import PeoplePicker from '$lib/components/PeoplePicker.svelte';
  import StepHeader from '$lib/components/StepHeader.svelte';
  import { FIRST_STEP_HREF } from '$lib/config/steps';
  import { copertoEnabled } from '$lib/config/tenant';

  // Still prerendered, just unlinked when the tenant has no coperto — bounce
  // old bookmarks to the first real step instead of showing a dead end.
  $effect(() => {
    if (!copertoEnabled) goto(FIRST_STEP_HREF, { replaceState: true });
  });
</script>

<StepHeader title="Il tuo tavolo" subtitle="Iniziamo: quanti siete a mangiare?" />

<div class="flex-1 flex items-center justify-center px-4 pb-6 max-w-2xl mx-auto w-full">
  <PeoplePicker />
</div>
