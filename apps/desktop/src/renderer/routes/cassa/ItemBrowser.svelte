<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';
  import { buildStockIdIndex } from '@sagra/shared/utils/stock';
  import type { Menu, MenuItem, MenuOption } from '@sagra/shared/types';

  let {
    menu,
    cart,
    stock,
    activeCategoryId,
    onCategoryChange,
    onItemTap,
    onOptionsRequest
  }: {
    menu: Menu;
    cart: Record<string, number>;
    stock: Record<string, number>;
    activeCategoryId: string;
    onCategoryChange: (id: string) => void;
    onItemTap: (item: MenuItem) => void;
    onOptionsRequest?: (item: MenuItem) => void;
  } = $props();

  const categoryOptions = $derived(
    Object.fromEntries(menu.categories.map((c) => [c.id, c.options ?? []])) as Record<string, MenuOption[]>
  );

  const activeCategory = $derived(
    menu.categories.find((c) => c.id === activeCategoryId) ?? menu.categories[0]
  );

  const stockIdIndex = $derived(buildStockIdIndex(menu));

  function stockIdFor(itemId: string): string {
    return stockIdIndex[itemId] ?? itemId;
  }

  // Count all cart entries for this item, including option-combo variants (key = `id||opt1,opt2`).
  function cartQty(item: MenuItem): number {
    const ids = item.variants?.length ? item.variants.map((v) => v.id) : [item.id];
    return Object.entries(cart).reduce((sum, [key, qty]) => {
      const base = key.includes('||') ? key.slice(0, key.indexOf('||')) : key;
      return ids.includes(base) ? sum + qty : sum;
    }, 0);
  }

  // True when the item (or all its variants) are explicitly limited to 0 in stock
  function isSoldOut(item: MenuItem): boolean {
    if (item.variants?.length) {
      const stockId = stockIdFor(item.id);
      return stockId in stock && stock[stockId] === 0;
    }
    const stockId = stockIdFor(item.id);
    return stockId in stock && stock[stockId] === 0;
  }

  function stockLabel(item: MenuItem): string | null {
    const stockId = stockIdFor(item.id);
    if (!(stockId in stock) || stock[stockId] === 0) return null;
    return `${stock[stockId]} rimasti`;
  }

  function pizzaStripeColor(item: MenuItem): string | null {
    if (activeCategory.id !== 'pizze') return null;

    const label = `${item.id} ${item.name} ${item.description ?? ''}`.toLowerCase();
    const isBianca =
      label.includes('bianca') ||
      label.includes('focaccia') ||
      label.includes('focaccina') ||
      label.includes('ciaccino') ||
      item.id === 'genova';

    return isBianca ? '#f59e0b' : '#dc2626';
  }
</script>

<div class="flex flex-col w-[58%] border-r border-gray-200 bg-white overflow-hidden">

  <!-- Category tabs -->
  <div class="shrink-0 flex gap-1 px-2 pt-2 pb-1 overflow-x-auto bg-gray-50 border-b border-gray-200">
    {#each menu.categories as cat}
      <button
        type="button"
        onclick={() => onCategoryChange(cat.id)}
        class="shrink-0 px-4 py-2 rounded-t text-sm font-bold transition-colors"
        class:bg-white={cat.id === activeCategoryId}
        class:text-green-900={cat.id === activeCategoryId}
        class:border={cat.id === activeCategoryId}
        class:border-gray-200={cat.id === activeCategoryId}
        class:border-b-white={cat.id === activeCategoryId}
        class:text-gray-500={cat.id !== activeCategoryId}
        class:hover:text-gray-800={cat.id !== activeCategoryId}
      >
        {cat.label}
      </button>
    {/each}
  </div>

  <!-- Item grid -->
  <div class="flex-1 overflow-y-auto p-3">
    {#each activeCategory.groups as group}
      {#if group.label}
        <p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 mt-3 first:mt-0 px-1">
          {group.label}
        </p>
      {/if}
      <div class="grid grid-cols-2 gap-2 mb-1">
        {#each group.items as item}
          {@const qty = cartQty(item)}
          {@const soldOut = isSoldOut(item)}
          {@const hasOptions = (categoryOptions[activeCategory.id]?.length ?? 0) > 0}
          {@const remainingLabel = stockLabel(item)}
          {@const stripeColor = pizzaStripeColor(item)}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            role="button"
            tabindex={soldOut ? -1 : 0}
            onclick={() => !soldOut && onItemTap(item)}
            style:border-left-color={!soldOut && stripeColor ? stripeColor : undefined}
            class="relative text-left rounded-lg border-2 px-3 py-3 transition-colors select-none"
            class:active:scale-[0.97]={!soldOut}
            class:border-l-8={stripeColor && !soldOut}
            class:border-green-700={qty > 0 && !soldOut}
            class:bg-green-50={qty > 0 && !soldOut}
            class:border-gray-200={qty === 0 && !soldOut}
            class:hover:border-gray-300={qty === 0 && !soldOut}
            class:border-gray-100={soldOut}
            class:bg-gray-50={soldOut}
            class:opacity-50={soldOut}
            class:cursor-not-allowed={soldOut}
            class:cursor-pointer={!soldOut}
          >
            <span class="block pr-7 text-base font-bold leading-tight" class:text-gray-900={!soldOut} class:text-gray-400={soldOut}>{item.name}</span>
            {#if item.description}
              <span class="block text-xs text-gray-400 mt-0.5 leading-tight">{item.description}</span>
            {/if}
            {#if item.variants?.length}
              <span class="block text-xs text-gray-400 mt-1">
                {item.variants.map((v) => v.label).join(' · ')}
              </span>
            {/if}
            <span class="block mt-1 text-xs font-semibold" class:text-gray-500={!soldOut} class:text-gray-400={soldOut}>
              {soldOut ? 'Esaurito' : formatEUR(item.price)}
            </span>

            {#if remainingLabel && !soldOut}
              <span class="mt-1 inline-block max-w-full whitespace-normal break-words rounded bg-amber-100 px-2 py-0.5 text-xs font-bold leading-tight text-amber-800">
                {remainingLabel}
              </span>
            {/if}

            {#if hasOptions && !item.variants?.length && !soldOut}
              <button
                type="button"
                onclick={(e) => { e.stopPropagation(); onOptionsRequest?.(item); }}
                class="mt-1 text-xs font-semibold text-green-700 hover:underline"
              >
                + opzioni
              </button>
            {/if}

            {#if qty > 0 && !soldOut}
              <span class="absolute top-2 right-2 min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-green-700 text-white text-xs font-bold px-1">
                {qty}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>

</div>
