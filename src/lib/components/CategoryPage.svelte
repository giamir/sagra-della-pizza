<script lang="ts">
  import ItemRow from '$lib/components/ItemRow.svelte';
  import StepHeader from '$lib/components/StepHeader.svelte';
  import type { MenuCategory } from '$lib/types';

  type Props = { category: MenuCategory; subtitle?: string };
  let { category, subtitle }: Props = $props();
</script>

<StepHeader title={category.label} {subtitle} />

<div class="px-4 pb-6 max-w-2xl mx-auto w-full">
  {#each category.groups as group (group.label)}
    {#if group.label}
      <h2 class="mt-6 mb-1 text-xl font-bold text-tomato uppercase tracking-wide">
        {group.label}
      </h2>
    {/if}
    <ul class="bg-cream-50 rounded-lg">
      {#each group.items as item (item.id)}
        <li>
          <ItemRow {item} />
        </li>
      {/each}
    </ul>
  {/each}
</div>
