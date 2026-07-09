<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import menuData from '@sagra/shared/data/menu.json';
  import { ArrowLeft } from 'lucide-svelte';
  import type { Menu } from '@sagra/shared/types';

  let { onClose }: { onClose: () => void } = $props();

  const DEFAULT_MENU = menuData as Menu;

  // The live catalog drives the list — on a client till this is the host's
  // catalog, so items added on any till (with their real ids) show up here.
  let menu = $state<Menu>(DEFAULT_MENU);

  // Group by category for display, built from whatever catalog is live.
  const categories = $derived(
    menu.categories.map((cat) => ({
      id: cat.id,
      label: cat.label,
      items: cat.groups.flatMap((group) =>
        group.items
          // Chooser groups (e.g. Acqua) hold no stock themselves; their choices
          // are separate hidden items that each carry their own scorte line.
          .filter((item) => !item.choices)
          .map((item) => ({ id: item.id, name: item.name }))
      )
    }))
  );

  let stock = $state<Record<string, number>>({});
  let pendingQty = $state<Record<string, string>>({}); // input values per item
  let saving = $state<Record<string, boolean>>({});
  let activeTab = $state('');

  let unsubStock: (() => void) | null = null;
  let unsubCatalog: (() => void) | null = null;

  async function refreshCatalog() {
    const result = await window.api.getCatalog();
    menu = (result.catalog as Menu | undefined) ?? DEFAULT_MENU;
    if (!menu.categories.some((cat) => cat.id === activeTab)) {
      activeTab = menu.categories[0]?.id ?? '';
    }
  }

  onMount(async () => {
    await refreshCatalog();
    stock = await window.api.getStock();
    // Keep the raw "rimasti" counts live as orders decrement stock elsewhere.
    // Admin shows the persisted remaining, not the cart-hold-netted figure.
    unsubStock = window.api.onStockUpdate(({ stock: s }) => { stock = s; });
    // A catalog edit on any till changes which items exist here.
    unsubCatalog = window.api.onCatalogUpdate(() => { void refreshCatalog(); });
  });

  onDestroy(() => {
    unsubStock?.();
    unsubCatalog?.();
  });

  function stockLabel(id: string): string {
    if (!(id in stock)) return '∞';
    return stock[id] === 0 ? 'Esaurito' : String(stock[id]);
  }

  function isLimited(id: string): boolean {
    return id in stock;
  }

  async function applyLimit(id: string) {
    const raw = pendingQty[id];
    const qty = parseInt(raw ?? '0', 10);
    if (isNaN(qty) || qty < 0) return;
    saving[id] = true;
    try {
      await window.api.setStock(id, qty);
      stock = await window.api.getStock();
      delete pendingQty[id];
    } finally {
      saving[id] = false;
    }
  }

  async function removeLimit(id: string) {
    saving[id] = true;
    try {
      await window.api.resetStock(id);
      stock = await window.api.getStock();
    } finally {
      saving[id] = false;
    }
  }

  async function markSoldOut(id: string) {
    saving[id] = true;
    try {
      await window.api.setStock(id, 0);
      stock = await window.api.getStock();
    } finally {
      saving[id] = false;
    }
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Gestione scorte"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-white dark:bg-[#20242c] flex flex-col"
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="flex flex-col flex-1 overflow-hidden">

    <!-- App bar -->
    <div class="shrink-0 h-12 bg-green-900 text-white flex items-center px-4 gap-3">
      <button type="button" onclick={onClose} class="text-green-200 hover:text-white font-bold text-sm mr-1 inline-flex items-center gap-1"><ArrowLeft size={16} /> Cassa</button>
      <span class="font-bold tracking-wide text-sm uppercase">Gestione Scorte</span>
    </div>

    <!-- Category tabs -->
    <div class="shrink-0 flex gap-1 px-4 overflow-x-auto border-b border-gray-200">
      {#each categories as cat}
        <button
          type="button"
          onclick={() => activeTab = cat.id}
          class="shrink-0 px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px"
          class:border-green-700={cat.id === activeTab}
          class:text-green-900={cat.id === activeTab}
          class:border-transparent={cat.id !== activeTab}
          class:text-gray-500={cat.id !== activeTab}
          class:hover:text-gray-800={cat.id !== activeTab}
        >
          {cat.label}
        </button>
      {/each}
    </div>

    <!-- Item list -->
    <div class="flex-1 overflow-y-auto px-4 py-3">
      {#each categories as cat}
        {#if cat.id === activeTab}
          <div class="flex flex-col gap-1">
            {#each cat.items as row}
              {@const limited = isLimited(row.id)}
              {@const soldOut = limited && stock[row.id] === 0}
              <div class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100">
                <!-- Name -->
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-medium text-gray-900 truncate block">{row.name}</span>
                </div>

                <!-- Stock badge -->
                <div class="shrink-0 w-20 text-right">
                  {#if soldOut}
                    <span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">Esaurito</span>
                  {:else if limited}
                    <span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">{stock[row.id]} rimasti</span>
                  {:else}
                    <span class="inline-block px-2 py-0.5 rounded-full text-xs text-gray-400">illimitato</span>
                  {/if}
                </div>

                <!-- Quick actions -->
                <div class="shrink-0 flex items-center gap-2">
                  {#if !soldOut}
                    <!-- Mark sold out -->
                    <button
                      type="button"
                      onclick={() => markSoldOut(row.id)}
                      disabled={saving[row.id]}
                      class="px-2 py-1 rounded text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40"
                      title="Segna come esaurito"
                    >
                      Esaurito
                    </button>
                  {/if}

                  {#if limited}
                    <!-- Remove limit -->
                    <button
                      type="button"
                      onclick={() => removeLimit(row.id)}
                      disabled={saving[row.id]}
                      class="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                      title="Rimuovi limite"
                    >
                      Rimuovi
                    </button>
                  {/if}

                  <!-- Set qty input -->
                  <div class="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      placeholder="Qtà"
                      bind:value={pendingQty[row.id]}
                      class="w-16 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-600"
                      onkeydown={(e) => { if (e.key === 'Enter') applyLimit(row.id); }}
                    />
                    <button
                      type="button"
                      onclick={() => applyLimit(row.id)}
                      disabled={saving[row.id] || !pendingQty[row.id]}
                      class="px-2 py-1 rounded text-xs font-bold bg-green-700 text-white hover:bg-green-800 disabled:opacity-40"
                    >
                      {saving[row.id] ? '…' : 'OK'}
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/each}
    </div>

  </div>
</div>
