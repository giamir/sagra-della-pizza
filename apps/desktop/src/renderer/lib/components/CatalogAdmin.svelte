<script lang="ts">
  import { onMount } from 'svelte';
  import type { Menu, MenuCategory, MenuGroup, MenuItem } from '@sagra/shared/types';
  import { STATION_ORDER } from '$lib/station-order';

  let { onClose }: { onClose: () => void } = $props();

  const STATIONS = ['', ...STATION_ORDER, 'Altro'] as string[];

  let catalog = $state<Menu | null>(null);
  let stations = $state<Record<string, string>>({});
  let activeTab = $state('');
  let saving = $state(false);
  let exporting = $state(false);
  let statusMsg = $state<{ text: string; ok: boolean } | null>(null);

  onMount(async () => {
    const result = await window.api.getCatalog();
    catalog = result.catalog as Menu;
    stations = result.stations as Record<string, string>;
    activeTab = catalog.categories[0]?.id ?? '';
  });

  function showStatus(text: string, ok = true) {
    statusMsg = { text, ok };
    setTimeout(() => { statusMsg = null; }, 3000);
  }

  async function save() {
    if (!catalog) return;
    saving = true;
    try {
      await window.api.saveCatalog(catalog, stations);
      showStatus('Salvato');
    } catch {
      showStatus('Errore salvataggio', false);
    } finally {
      saving = false;
    }
  }

  async function exportJson() {
    if (!catalog) return;
    exporting = true;
    try {
      // Save first so export reflects latest edits
      await window.api.saveCatalog(catalog, stations);
      const result = await window.api.exportCatalog();
      if (result.cancelled) {
        // user dismissed dialog — no message needed
      } else if (result.ok) {
        showStatus(`Esportato: ${result.filePath}`);
      } else {
        showStatus('Errore esportazione', false);
      }
    } catch {
      showStatus('Errore esportazione', false);
    } finally {
      exporting = false;
    }
  }

  function activeCategory(): MenuCategory | undefined {
    return catalog?.categories.find((c) => c.id === activeTab);
  }

  // --- Item editing helpers ---

  function updateItem(catId: string, groupLabel: string, itemId: string, patch: Partial<MenuItem>) {
    if (!catalog) return;
    catalog = {
      ...catalog,
      categories: catalog.categories.map((cat) => {
        if (cat.id !== catId) return cat;
        return {
          ...cat,
          groups: cat.groups.map((g) => {
            if (g.label !== groupLabel) return g;
            return {
              ...g,
              items: g.items.map((item) => item.id === itemId ? { ...item, ...patch } : item)
            };
          })
        };
      })
    };
  }

  function deleteItem(catId: string, groupLabel: string, itemId: string) {
    if (!catalog) return;
    // Also remove station override
    const next = { ...stations };
    delete next[itemId];
    stations = next;

    catalog = {
      ...catalog,
      categories: catalog.categories.map((cat) => {
        if (cat.id !== catId) return cat;
        return {
          ...cat,
          groups: cat.groups.map((g) => {
            if (g.label !== groupLabel) return g;
            return { ...g, items: g.items.filter((item) => item.id !== itemId) };
          })
        };
      })
    };
  }

  function addItem(catId: string, groupLabel: string) {
    if (!catalog) return;
    const id = `item-${Date.now()}`;
    const newItem: MenuItem = { id, name: '', price: 0 };
    catalog = {
      ...catalog,
      categories: catalog.categories.map((cat) => {
        if (cat.id !== catId) return cat;
        return {
          ...cat,
          groups: cat.groups.map((g) => {
            if (g.label !== groupLabel) return g;
            return { ...g, items: [...g.items, newItem] };
          })
        };
      })
    };
  }

  function updateCoperto(value: number) {
    if (!catalog) return;
    catalog = { ...catalog, coperto: { perPersona: value } };
  }

  function stationFor(item: MenuItem): string {
    return stations[item.id] ?? '';
  }

  function setStation(item: MenuItem, station: string) {
    // Apply to all variant IDs too if the item has variants
    const next = { ...stations };
    if (station === '') {
      delete next[item.id];
      if (item.variants) {
        for (const v of item.variants) delete next[v.id];
      }
    } else {
      next[item.id] = station;
      if (item.variants) {
        for (const v of item.variants) next[v.id] = station;
      }
    }
    stations = next;
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Catalogo"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-white flex flex-col"
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <!-- App bar -->
  <div class="shrink-0 h-12 bg-green-900 text-white flex items-center px-4 gap-3">
    <button type="button" onclick={onClose} class="text-green-200 hover:text-white font-bold text-sm mr-1">← Cassa</button>
    <span class="font-bold tracking-wide text-sm uppercase">Catalogo</span>

    {#if statusMsg}
      <span class="text-sm {statusMsg.ok ? 'text-green-200' : 'text-red-300'} truncate">{statusMsg.text}</span>
    {/if}

    <div class="ml-auto flex items-center gap-2">
      <button
        type="button"
        onclick={save}
        disabled={saving || !catalog}
        class="px-3 py-1 rounded text-xs font-bold border border-green-600 text-green-200 hover:bg-green-800 disabled:opacity-40"
      >
        {saving ? '…' : 'Salva'}
      </button>
      <button
        type="button"
        onclick={exportJson}
        disabled={exporting || !catalog}
        class="px-3 py-1 rounded text-xs font-bold bg-white text-green-900 hover:bg-green-100 disabled:opacity-40"
      >
        {exporting ? '…' : 'Esporta menu.json'}
      </button>
    </div>
  </div>

  {#if !catalog}
    <div class="flex-1 flex items-center justify-center text-gray-400 text-sm">Caricamento…</div>
  {:else}
    <!-- Category tabs -->
    <div class="shrink-0 flex gap-1 px-4 overflow-x-auto border-b border-gray-200">
      {#each catalog.categories as cat}
        <button
          type="button"
          onclick={() => activeTab = cat.id}
          class="shrink-0 px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px"
          class:border-green-700={cat.id === activeTab}
          class:text-green-900={cat.id === activeTab}
          class:border-transparent={cat.id !== activeTab}
          class:text-gray-500={cat.id !== activeTab}
        >
          {cat.label}
        </button>
      {/each}
      <!-- Coperto tab -->
      <button
        type="button"
        onclick={() => activeTab = '__coperto__'}
        class="shrink-0 px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px"
        class:border-green-700={'__coperto__' === activeTab}
        class:text-green-900={'__coperto__' === activeTab}
        class:border-transparent={'__coperto__' !== activeTab}
        class:text-gray-500={'__coperto__' !== activeTab}
      >
        Coperto
      </button>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-y-auto px-4 py-4">
      {#if activeTab === '__coperto__'}
        <!-- Coperto editor -->
        <div class="max-w-xs">
          <p class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Coperto per persona</p>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-700">€</span>
            <input
              type="number"
              min="0"
              step="0.50"
              value={catalog.coperto.perPersona}
              oninput={(e) => updateCoperto(parseFloat((e.target as HTMLInputElement).value) || 0)}
              class="w-28 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
            />
          </div>
          <p class="text-xs text-gray-400 mt-2">Importo aggiunto per ogni coperto in un ordine manuale.</p>
        </div>

      {:else}
        {@const cat = activeCategory()}
        {#if cat}
          {#each cat.groups as group}
            <!-- Group header -->
            <p class="text-xs font-bold uppercase tracking-wider text-gray-500 mt-4 mb-2 first:mt-0">{group.label}</p>

            <!-- Column headers -->
            <div class="grid grid-cols-[1fr_1fr_7rem_8rem_2rem] gap-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <span>Nome</span>
              <span>Descrizione</span>
              <span>Prezzo (€)</span>
              <span>Stazione</span>
              <span></span>
            </div>

            <!-- Item rows -->
            <div class="flex flex-col gap-0.5">
              {#each group.items as item}
                <div class="grid grid-cols-[1fr_1fr_7rem_8rem_2rem] gap-2 items-center px-3 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100">
                  <!-- Name -->
                  <div>
                    <input
                      type="text"
                      value={item.name}
                      oninput={(e) => updateItem(cat.id, group.label, item.id, { name: (e.target as HTMLInputElement).value })}
                      placeholder="Nome voce"
                      class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                    />
                    {#if item.variants?.length}
                      <p class="text-xs text-gray-400 mt-0.5 truncate">
                        varianti: {item.variants.map((v) => v.label).join(', ')}
                      </p>
                    {/if}
                  </div>

                  <!-- Description -->
                  <input
                    type="text"
                    value={item.description ?? ''}
                    oninput={(e) => updateItem(cat.id, group.label, item.id, { description: (e.target as HTMLInputElement).value || undefined })}
                    placeholder="—"
                    class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                  />

                  <!-- Price -->
                  <input
                    type="number"
                    min="0"
                    step="0.50"
                    value={item.price}
                    oninput={(e) => updateItem(cat.id, group.label, item.id, { price: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                    class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                  />

                  <!-- Station -->
                  <select
                    value={stationFor(item)}
                    onchange={(e) => setStation(item, (e.target as HTMLSelectElement).value)}
                    class="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-600"
                  >
                    <option value="">— auto —</option>
                    {#each STATION_ORDER as s}
                      <option value={s}>{s}</option>
                    {/each}
                    <option value="Altro">Altro</option>
                  </select>

                  <!-- Delete -->
                  <button
                    type="button"
                    onclick={() => deleteItem(cat.id, group.label, item.id)}
                    class="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 text-base leading-none"
                    title="Elimina voce"
                  >
                    ×
                  </button>
                </div>
              {/each}
            </div>

            <!-- Add item button -->
            <button
              type="button"
              onclick={() => addItem(cat.id, group.label)}
              class="mt-2 mb-4 px-3 py-1.5 rounded text-xs font-semibold text-green-700 border border-dashed border-green-300 hover:bg-green-50"
            >
              + Aggiungi voce
            </button>
          {/each}
        {/if}
      {/if}
    </div>
  {/if}
</div>
