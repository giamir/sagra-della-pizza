<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';
  import { optionsForItem } from '@sagra/shared/utils/pricing';
  import { buildStockIdIndex } from '@sagra/shared/utils/stock';
  import { normalizeBand, type BandColour } from '@sagra/shared/utils/bands';
  import type { Menu, MenuItem, MenuOption } from '@sagra/shared/types';

  let {
    menu,
    cart,
    stock,
    reserved,
    activeCategoryId,
    onCategoryChange,
    onItemTap,
    onOptionsRequest
  }: {
    menu: Menu;
    cart: Record<string, number>;
    stock: Record<string, number>;
    reserved: Record<string, number>;
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

  // Every item across the menu, keyed by id — used to resolve a chooser's choices.
  const itemsById = $derived(
    Object.fromEntries(
      menu.categories.flatMap((c) => c.groups.flatMap((g) => g.items.map((i) => [i.id, i])))
    ) as Record<string, MenuItem>
  );

  // The real (hidden) items a chooser presents; empty for non-chooser items.
  function choicesOf(item: MenuItem): MenuItem[] {
    return (item.choices ?? []).map((id) => itemsById[id]).filter(Boolean) as MenuItem[];
  }

  function stockIdFor(itemId: string): string {
    return stockIdIndex[itemId] ?? itemId;
  }

  // Count all cart entries for this item, including option-combo variants (key = `id||opt1,opt2`).
  // A chooser sums the cart quantity of each of its choices.
  function cartQty(item: MenuItem): number {
    const choices = choicesOf(item);
    if (choices.length) return choices.reduce((sum, c) => sum + cartQty(c), 0);
    const ids = item.variants?.length
      ? [...(item.optionalVariants ? [item.id] : []), ...item.variants.map((v) => v.id)]
      : [item.id];
    return Object.entries(cart).reduce((sum, [key, qty]) => {
      const base = key.includes('||') ? key.slice(0, key.indexOf('||')) : key;
      return ids.includes(base) ? sum + qty : sum;
    }, 0);
  }

  // Effective remaining = persisted remaining − units held in carts across all
  // tills. -1 means "no stock limit". Clamped at 0 so a brief over-hold (lag)
  // never shows a negative count.
  function effectiveRemaining(item: MenuItem): number {
    const stockId = stockIdFor(item.id);
    if (!(stockId in stock)) return -1;
    return Math.max(0, stock[stockId] - (reserved[stockId] ?? 0));
  }

  // Esaurito once every remaining unit is either sold or already held in a cart.
  // A chooser is esaurito only when every one of its choices is esaurito.
  function isSoldOut(item: MenuItem): boolean {
    const choices = choicesOf(item);
    if (choices.length) return choices.every((c) => isSoldOut(c));
    return effectiveRemaining(item) === 0;
  }

  // Choices can differ in price (Acqua 500 ml / 1 L), so a chooser shows "da €X".
  function priceLabel(item: MenuItem): string {
    const choices = choicesOf(item);
    if (choices.length) {
      const prices = choices.map((c) => c.price);
      const min = Math.min(...prices);
      return prices.every((p) => p === min) ? formatEUR(min) : `da ${formatEUR(min)}`;
    }
    return formatEUR(item.price);
  }

  // Fascia colore (Kontorno-style): the token resolves through these static
  // records, so an unknown value can never reach a class string. The band is a
  // 6px left border on its own rounded overlay (not the tile's real border,
  // which the qty/soldout states repaint), plus a faint wash across the tile.
  const bandEdgeClasses: Record<BandColour, string> = {
    lampone: 'border-l-rose-500',
    rame: 'border-l-orange-500',
    ambra: 'border-l-amber-400',
    oliva: 'border-l-lime-600',
    verde: 'border-l-green-600',
    smeraldo: 'border-l-emerald-500',
    blu: 'border-l-sky-500',
    indaco: 'border-l-indigo-500',
    viola: 'border-l-violet-500',
    ciclamino: 'border-l-pink-500'
  };
  const bandWashClasses: Record<BandColour, string> = {
    lampone: 'bg-linear-to-r from-rose-500/10 to-rose-500/5',
    rame: 'bg-linear-to-r from-orange-500/10 to-orange-500/5',
    ambra: 'bg-linear-to-r from-amber-400/10 to-amber-400/5',
    oliva: 'bg-linear-to-r from-lime-600/10 to-lime-600/5',
    verde: 'bg-linear-to-r from-green-600/10 to-green-600/5',
    smeraldo: 'bg-linear-to-r from-emerald-500/10 to-emerald-500/5',
    blu: 'bg-linear-to-r from-sky-500/10 to-sky-500/5',
    indaco: 'bg-linear-to-r from-indigo-500/10 to-indigo-500/5',
    viola: 'bg-linear-to-r from-violet-500/10 to-violet-500/5',
    ciclamino: 'bg-linear-to-r from-pink-500/10 to-pink-500/5'
  };

  // No aggregate "N rimasti" badge on a chooser — each choice shows its own in the picker.
  function stockLabel(item: MenuItem): string | null {
    if (item.choices?.length) return null;
    const remaining = effectiveRemaining(item);
    if (remaining <= 0) return null;
    return `${remaining} rimasti`;
  }

</script>

<div class="flex flex-col w-[58%] border-r border-gray-200 bg-white dark:bg-[#20242c] overflow-hidden">

  <!-- Category tabs -->
  <!-- min-h-[52px] keeps every tab a comfortable finger target even with a
       one-word label; the inactive state gets its own surface (not bare text)
       so the touch area reads as a button in both light and dark mode. -->
  <div class="shrink-0 flex gap-1.5 px-2 pt-2 pb-1 overflow-x-auto bg-gray-50 dark:bg-[#181b21] border-b border-gray-200">
    {#each menu.categories as cat}
      <button
        type="button"
        onclick={() => onCategoryChange(cat.id)}
        class={`shrink-0 min-h-[52px] px-6 py-2.5 rounded-t-lg text-base font-bold transition-colors ${
          cat.id === activeCategoryId
            ? 'bg-green-700 text-white border-2 border-green-700'
            : 'bg-gray-100 dark:bg-[#262b34] text-gray-800 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-[#2e3440]'
        }`}
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
        {#each group.items.filter((i) => !i.hidden) as item}
          {@const qty = cartQty(item)}
          {@const soldOut = isSoldOut(item)}
          {@const itemOpts = optionsForItem(item, categoryOptions[activeCategory.id] ?? [])}
          {@const remainingLabel = stockLabel(item)}
          {@const band = normalizeBand(item.band)}
          <!-- pl-[18px] = px-3 (12px) + the 6px band: the label gutter is
               measured from the inside of the band, not the tile's edge. -->
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            role="button"
            tabindex={soldOut ? -1 : 0}
            onclick={() => !soldOut && onItemTap(item)}
            class={`relative text-left rounded-lg border-2 px-3 py-3 transition-colors select-none ${
              band && !soldOut ? `pl-[18px] ${bandWashClasses[band]}` : ''
            }`}
            class:active:scale-[0.97]={!soldOut}
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
            {#if band && !soldOut}
              <!-- Own rounded overlay so the band tapers with the corner radius
                   and survives the tile's border repaint on selection.
                   aria-hidden: purely a visual grouping aid. -->
              <span
                aria-hidden="true"
                class={`pointer-events-none absolute inset-0 rounded-md border-l-[6px] ${bandEdgeClasses[band]}`}
              ></span>
            {/if}
            <span class="block pr-7 text-base font-bold leading-tight" class:text-gray-900={!soldOut} class:text-gray-400={soldOut}>{item.name}</span>
            {#if item.description}
              <span class="block text-xs text-gray-400 mt-0.5 leading-tight">{item.description}</span>
            {/if}
            {#if item.variants?.length && !item.optionalVariants}
              <span class="block text-xs text-gray-400 mt-1">
                {item.variants.map((v) => v.label).join(' · ')}
              </span>
            {/if}
            {#if item.choices?.length}
              <span class="block text-xs text-gray-400 mt-1">
                {choicesOf(item).map((c) => c.name).join(' · ')}
              </span>
            {/if}
            <span class="block mt-1 text-xs font-semibold" class:text-gray-500={!soldOut} class:text-gray-400={soldOut}>
              {soldOut ? 'Esaurito' : priceLabel(item)}
            </span>

            {#if remainingLabel && !soldOut}
              <span class="mt-1 inline-block max-w-full whitespace-normal break-words rounded bg-amber-100 px-2 py-0.5 text-xs font-bold leading-tight text-amber-800">
                {remainingLabel}
              </span>
            {/if}

            {#if (itemOpts.length > 0 || item.optionalVariants) && !soldOut}
              <button
                type="button"
                onclick={(e) => { e.stopPropagation(); onOptionsRequest?.(item); }}
                aria-label="Opzioni"
                title="Opzioni"
                class="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-lg border border-green-200 bg-green-50 text-green-700 transition-colors hover:bg-green-100 active:bg-green-200"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="21" x2="14" y1="4" y2="4" />
                  <line x1="10" x2="3" y1="4" y2="4" />
                  <line x1="21" x2="12" y1="12" y2="12" />
                  <line x1="8" x2="3" y1="12" y2="12" />
                  <line x1="21" x2="16" y1="20" y2="20" />
                  <line x1="12" x2="3" y1="20" y2="20" />
                  <line x1="14" x2="14" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="10" y2="14" />
                  <line x1="16" x2="16" y1="18" y2="22" />
                </svg>
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
