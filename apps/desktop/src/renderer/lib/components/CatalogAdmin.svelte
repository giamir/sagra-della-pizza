<script lang="ts">
  import { onMount } from 'svelte';
  import type { Menu, MenuCategory, MenuGroup, MenuItem } from '@sagra/shared/types';
  import { ArrowLeft, ChevronUp, ChevronDown, X } from 'lucide-svelte';

  let { onClose }: { onClose: () => void } = $props();

  // 'Altro' is the always-available catch-all; it is not part of the managed list.
  const FALLBACK_STATION = 'Altro';

  let catalog = $state<Menu | null>(null);
  let stations = $state<Record<string, string>>({});
  let stationList = $state<string[]>([]);
  let copertoStation = $state('');
  let newStation = $state('');
  let newCategory = $state('');
  let activeTab = $state('');
  let saving = $state(false);
  let exporting = $state(false);
  let statusMsg = $state<{ text: string; ok: boolean } | null>(null);

  // Options offered in the per-item dropdown: the managed stations plus the catch-all.
  const stationOptions = $derived([...stationList, FALLBACK_STATION]);

  onMount(async () => {
    const result = await window.api.getCatalog();
    catalog = result.catalog as Menu;
    stations = result.stations as Record<string, string>;
    stationList = (result.stationList as string[] | undefined) ?? [];
    copertoStation = (result.copertoStation as string | undefined) ?? stationList[0] ?? '';
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
      await window.api.saveCatalog(catalog, stations, stationList, copertoStation);
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
      await window.api.saveCatalog(catalog, stations, stationList, copertoStation);
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
    // New items get an explicit station (first managed station) — never "auto".
    stations = { ...stations, [id]: stationList[0] ?? FALLBACK_STATION };
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
    return stations[item.id] ?? stationList[0] ?? FALLBACK_STATION;
  }

  function setStation(item: MenuItem, station: string) {
    // Apply to all variant IDs too if the item has variants
    const next = { ...stations };
    next[item.id] = station;
    if (item.variants) {
      for (const v of item.variants) next[v.id] = station;
    }
    stations = next;
  }

  // --- Station management ---

  function addStation() {
    const name = newStation.trim();
    if (!name) return;
    if (stationList.some((s) => s.toLowerCase() === name.toLowerCase())) {
      showStatus('Stazione già esistente', false);
      return;
    }
    stationList = [...stationList, name];
    newStation = '';
  }

  function removeStation(name: string) {
    if (stationList.length <= 1) {
      showStatus('Serve almeno una stazione', false);
      return;
    }
    const remaining = stationList.filter((s) => s !== name);
    // Reassign any item currently on the removed station to the catch-all.
    const next = { ...stations };
    for (const [id, st] of Object.entries(next)) {
      if (st === name) next[id] = FALLBACK_STATION;
    }
    stations = next;
    if (copertoStation === name) copertoStation = remaining[0] ?? FALLBACK_STATION;
    stationList = remaining;
  }

  function itemsOnStation(name: string): number {
    return Object.values(stations).filter((s) => s === name).length;
  }

  function moveStation(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= stationList.length) return;
    const next = [...stationList];
    [next[index], next[target]] = [next[target], next[index]];
    stationList = next;
  }

  // --- Category management ---

  function updateCategory(catId: string, patch: Partial<MenuCategory>) {
    if (!catalog) return;
    catalog = {
      ...catalog,
      categories: catalog.categories.map((cat) => cat.id === catId ? { ...cat, ...patch } : cat)
    };
  }

  function addCategory() {
    if (!catalog) return;
    const label = newCategory.trim();
    if (!label) return;
    if (catalog.categories.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      showStatus('Categoria già esistente', false);
      return;
    }
    // New categories start with a single unnamed group so items can be added right away.
    const cat: MenuCategory = { id: `cat-${Date.now()}`, label, groups: [{ label: '', items: [] }] };
    catalog = { ...catalog, categories: [...catalog.categories, cat] };
    newCategory = '';
  }

  function removeCategory(catId: string) {
    if (!catalog) return;
    if (catalog.categories.length <= 1) {
      showStatus('Serve almeno una categoria', false);
      return;
    }
    const cat = catalog.categories.find((c) => c.id === catId);
    // Drop station overrides for every item (and variant) in the removed category.
    if (cat) {
      const next = { ...stations };
      for (const group of cat.groups) {
        for (const item of group.items) {
          delete next[item.id];
          if (item.variants) for (const v of item.variants) delete next[v.id];
        }
      }
      stations = next;
    }
    catalog = { ...catalog, categories: catalog.categories.filter((c) => c.id !== catId) };
  }

  function moveCategory(index: number, dir: -1 | 1) {
    if (!catalog) return;
    const target = index + dir;
    if (target < 0 || target >= catalog.categories.length) return;
    const next = [...catalog.categories];
    [next[index], next[target]] = [next[target], next[index]];
    catalog = { ...catalog, categories: next };
  }

  function itemsInCategory(cat: MenuCategory): number {
    return cat.groups.reduce((sum, g) => sum + g.items.length, 0);
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Catalogo"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-white dark:bg-[#20242c] flex flex-col"
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <!-- App bar -->
  <div class="shrink-0 h-12 bg-green-900 text-white flex items-center px-4 gap-3">
    <button type="button" onclick={onClose} class="text-green-200 hover:text-white font-bold text-sm mr-1 inline-flex items-center gap-1"><ArrowLeft size={16} /> Cassa</button>
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
        class="px-3 py-1 rounded text-xs font-bold bg-white dark:bg-[#20242c] text-green-900 hover:bg-green-100 disabled:opacity-40"
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
      <!-- Stazioni tab -->
      <button
        type="button"
        onclick={() => activeTab = '__stazioni__'}
        class="shrink-0 px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px"
        class:border-green-700={'__stazioni__' === activeTab}
        class:text-green-900={'__stazioni__' === activeTab}
        class:border-transparent={'__stazioni__' !== activeTab}
        class:text-gray-500={'__stazioni__' !== activeTab}
      >
        Stazioni
      </button>
      <!-- Categorie tab -->
      <button
        type="button"
        onclick={() => activeTab = '__categorie__'}
        class="shrink-0 px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px"
        class:border-green-700={'__categorie__' === activeTab}
        class:text-green-900={'__categorie__' === activeTab}
        class:border-transparent={'__categorie__' !== activeTab}
        class:text-gray-500={'__categorie__' !== activeTab}
      >
        Categorie
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

          <p class="text-xs font-bold uppercase tracking-wider text-gray-500 mt-6 mb-3">Stazione coperto</p>
          <select
            value={copertoStation}
            onchange={(e) => copertoStation = (e.target as HTMLSelectElement).value}
            class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white dark:bg-[#20242c] focus:outline-none focus:ring-1 focus:ring-green-600"
          >
            {#each stationList as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
          <p class="text-xs text-gray-400 mt-2">Il conteggio coperti viene stampato sul ticket di questa stazione.</p>
        </div>

      {:else if activeTab === '__stazioni__'}
        <!-- Station manager -->
        <div class="max-w-md">
          <p class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Stazioni</p>
          <p class="text-xs text-gray-400 mb-3">L'ordine determina la sequenza di stampa dei ticket.</p>

          <div class="flex flex-col gap-1">
            {#each stationList as s, i (s)}
              <div class="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                <span class="flex-1 text-sm text-gray-800">{s}</span>
                <span class="text-xs text-gray-400">{itemsOnStation(s)} voci</span>
                <button
                  type="button"
                  onclick={() => moveStation(i, -1)}
                  disabled={i === 0}
                  class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                  title="Sposta su"
                ><ChevronUp size={16} /></button>
                <button
                  type="button"
                  onclick={() => moveStation(i, 1)}
                  disabled={i === stationList.length - 1}
                  class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                  title="Sposta giù"
                ><ChevronDown size={16} /></button>
                <button
                  type="button"
                  onclick={() => removeStation(s)}
                  class="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                  title="Elimina stazione"
                ><X size={16} /></button>
              </div>
            {/each}
          </div>

          <div class="flex items-center gap-2 mt-4">
            <input
              type="text"
              bind:value={newStation}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStation(); } }}
              placeholder="Nuova stazione"
              class="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
            />
            <button
              type="button"
              onclick={addStation}
              class="px-3 py-1.5 rounded text-xs font-semibold text-green-700 border border-dashed border-green-300 hover:bg-green-50"
            >
              + Aggiungi
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-3">Eliminando una stazione, le voci collegate passano a "{FALLBACK_STATION}".</p>
        </div>

      {:else if activeTab === '__categorie__'}
        <!-- Category manager -->
        <div class="max-w-2xl">
          <p class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Categorie</p>
          <p class="text-xs text-gray-400 mb-3">L'ordine determina la sequenza delle schede e dell'ordinazione.</p>

          <div class="flex flex-col gap-1">
            {#each catalog.categories as cat, i (cat.id)}
              <div class="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                <div class="flex-1 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={cat.label}
                    oninput={(e) => updateCategory(cat.id, { label: (e.target as HTMLInputElement).value })}
                    placeholder="Nome categoria"
                    class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                  />
                  <input
                    type="text"
                    value={cat.subtitle ?? ''}
                    oninput={(e) => updateCategory(cat.id, { subtitle: (e.target as HTMLInputElement).value || undefined })}
                    placeholder="Sottotitolo (facoltativo)"
                    class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                  />
                </div>
                <span class="text-xs text-gray-400 w-14 text-right">{itemsInCategory(cat)} voci</span>
                <button
                  type="button"
                  onclick={() => moveCategory(i, -1)}
                  disabled={i === 0}
                  class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                  title="Sposta su"
                ><ChevronUp size={16} /></button>
                <button
                  type="button"
                  onclick={() => moveCategory(i, 1)}
                  disabled={i === catalog.categories.length - 1}
                  class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                  title="Sposta giù"
                ><ChevronDown size={16} /></button>
                <button
                  type="button"
                  onclick={() => removeCategory(cat.id)}
                  class="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                  title="Elimina categoria"
                ><X size={16} /></button>
              </div>
            {/each}
          </div>

          <div class="flex items-center gap-2 mt-4">
            <input
              type="text"
              bind:value={newCategory}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
              placeholder="Nuova categoria"
              class="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
            />
            <button
              type="button"
              onclick={addCategory}
              class="px-3 py-1.5 rounded text-xs font-semibold text-green-700 border border-dashed border-green-300 hover:bg-green-50"
            >
              + Aggiungi
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-3">Eliminando una categoria si rimuovono anche tutte le sue voci.</p>
        </div>

      {:else}
        {@const cat = activeCategory()}
        {#if cat}
          {#each cat.groups as group}
            <!-- Group header -->
            <p class="text-xs font-bold uppercase tracking-wider text-gray-500 mt-4 mb-2 first:mt-0">{group.label}</p>

            <!-- Column headers -->
            <div class="grid grid-cols-[1fr_1fr_7rem_11rem_2rem] gap-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <span>Nome</span>
              <span>Descrizione</span>
              <span>Prezzo (€)</span>
              <span>Stazione</span>
              <span></span>
            </div>

            <!-- Item rows -->
            <div class="flex flex-col gap-0.5">
              {#each group.items as item}
                <div class="grid grid-cols-[1fr_1fr_7rem_11rem_2rem] gap-2 items-center px-3 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100">
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
                    class="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white dark:bg-[#20242c] focus:outline-none focus:ring-1 focus:ring-green-600"
                  >
                    {#each stationOptions as s}
                      <option value={s}>{s}</option>
                    {/each}
                  </select>

                  <!-- Delete -->
                  <button
                    type="button"
                    onclick={() => deleteItem(cat.id, group.label, item.id)}
                    class="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                    title="Elimina voce"
                  >
                    <X size={16} />
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
