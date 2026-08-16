<script lang="ts">
  import { onMount } from 'svelte';
  import type { Menu, MenuCategory, MenuGroup, MenuItem } from '@sagra/shared/types';
  import { copertoEnabled } from '@sagra/shared/config/features';
  import { BAND_COLOURS, normalizeBand, type BandColour } from '@sagra/shared/utils/bands';
  import { ArrowLeft, ChevronUp, ChevronDown, X, Ban } from 'lucide-svelte';

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
  let resetting = $state(false);
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

  function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string' && err) return err;
    return fallback;
  }

  async function persistCatalog(): Promise<void> {
    if (!catalog) return;
    const catalogSnapshot = $state.snapshot(catalog) as Menu;
    const stationSnapshot = $state.snapshot(stations) as Record<string, string>;
    const stationListSnapshot = $state.snapshot(stationList) as string[];
    const result = await window.api.saveCatalog(catalogSnapshot, stationSnapshot, stationListSnapshot, copertoStation);
    if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
      throw new Error('error' in result && typeof result.error === 'string' ? result.error : 'Errore salvataggio');
    }
  }

  async function save() {
    saving = true;
    try {
      await persistCatalog();
      showStatus('Salvato');
    } catch (err) {
      showStatus(errorMessage(err, 'Errore salvataggio'), false);
    } finally {
      saving = false;
    }
  }

  async function exportJson() {
    if (!catalog) return;
    exporting = true;
    try {
      // Save first so export reflects latest edits
      await persistCatalog();
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

  // Drops this till's saved catalog and reloads the menu bundled with the
  // installed app version — the way to adopt options/variants shipped in an
  // update that the in-app editor can't express.
  async function resetToBundled() {
    if (!confirm(
      'Ripristinare il menu predefinito di questa versione?\n\n' +
      'Le modifiche fatte qui nel Catalogo verranno sostituite dal menu incluso nell’app. ' +
      'Ordini e incassi NON vengono toccati.'
    )) return;
    resetting = true;
    try {
      const result = await window.api.resetCatalog();
      catalog = result.catalog as Menu;
      stations = result.stations as Record<string, string>;
      stationList = (result.stationList as string[] | undefined) ?? [];
      copertoStation = (result.copertoStation as string | undefined) ?? stationList[0] ?? '';
      activeTab = catalog.categories[0]?.id ?? '';
      showStatus('Menu predefinito ripristinato');
    } catch (err) {
      showStatus(errorMessage(err, 'Errore ripristino'), false);
    } finally {
      resetting = false;
    }
  }

  function activeCategory(): MenuCategory | undefined {
    return catalog?.categories.find((c) => c.id === activeTab);
  }

  // --- Item editing helpers ---

  // Item ids are unique catalog-wide (slugify enforces it), so patch by id
  // wherever the item lives — a choice may sit in another group than its chooser.
  function updateItem(itemId: string, patch: Partial<MenuItem>) {
    if (!catalog) return;
    catalog = {
      ...catalog,
      categories: catalog.categories.map((cat) => ({
        ...cat,
        groups: cat.groups.map((g) => ({
          ...g,
          items: g.items.map((item) => item.id === itemId ? { ...item, ...patch } : item)
        }))
      }))
    };
  }

  function deleteItem(itemId: string) {
    if (!catalog) return;
    // A chooser takes its hidden choice items with it, wherever they live —
    // but only choices no other chooser still references, and never non-hidden
    // items (those stand on their own).
    const doomed = new Set([
      itemId,
      ...(findItem(itemId)?.choices ?? []).filter((id) => {
        if (!findItem(id)?.hidden) return false;
        return !allItems.some((i) => i.id !== itemId && (i.choices ?? []).includes(id));
      })
    ]);
    const next = { ...stations };
    for (const id of doomed) delete next[id];
    stations = next;

    catalog = {
      ...catalog,
      categories: catalog.categories.map((cat) => ({
        ...cat,
        groups: cat.groups.map((g) => ({ ...g, items: g.items.filter((item) => !doomed.has(item.id)) }))
      }))
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

  // --- Scelte (chooser → hidden choice items, e.g. Shot → Shot Vodka) ---

  // Item id whose choices panel is expanded, or null.
  let choicesEditorFor = $state<string | null>(null);
  let newChoiceName = $state('');

  // Single O(n) pass over the catalog feeding every lookup below — rebuilt only
  // when `catalog` changes, instead of one full scan per row per render.
  const allItems = $derived((catalog?.categories ?? []).flatMap((c) => c.groups.flatMap((g) => g.items)));
  const itemsById = $derived(new Map(allItems.map((i) => [i.id, i] as const)));
  // Ids already taken catalog-wide, variants included — slugify must not mint
  // an id that collides with a variant (stock and pricing key on those too).
  const takenIds = $derived(new Set(allItems.flatMap((i) => [i.id, ...(i.variants ?? []).map((v) => v.id)])));
  // Ids of hidden items reachable through some chooser — they are edited in the
  // parent's Scelte panel, so the flat item list skips them. Orphaned hidden
  // items (no chooser references them) stay visible as normal rows.
  const referencedChoiceIds = $derived(new Set(allItems.flatMap((i) => i.choices ?? [])));

  function findItem(id: string): MenuItem | undefined {
    return itemsById.get(id);
  }

  function choicesOf(item: MenuItem): MenuItem[] {
    return (item.choices ?? []).map((id) => findItem(id)).filter(Boolean) as MenuItem[];
  }

  function slugify(name: string): string {
    const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'voce';
    let id = base;
    let n = 2;
    while (takenIds.has(id)) id = `${base}-${n++}`;
    return id;
  }

  function addChoice(catId: string, groupLabel: string, parent: MenuItem) {
    const name = newChoiceName.trim();
    if (!catalog || !name) return;
    const id = slugify(name);
    const choice: MenuItem = { id, name, price: parent.price, hidden: true };
    // The choice prints where its chooser prints.
    stations = { ...stations, [id]: stationFor(parent) };
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
              items: [...g.items.map((i) => i.id === parent.id ? { ...i, choices: [...(i.choices ?? []), id] } : i), choice]
            };
          })
        };
      })
    };
    newChoiceName = '';
  }

  function removeChoice(parent: MenuItem, choiceId: string) {
    const remaining = (parent.choices ?? []).filter((id) => id !== choiceId);
    updateItem(parent.id, { choices: remaining.length ? remaining : undefined });
    // Delete the hidden item too — without a chooser it is unreachable. Keep it
    // if another chooser still references it, or if it's a visible item.
    const choice = findItem(choiceId);
    const stillReferenced = allItems.some((i) => i.id !== parent.id && (i.choices ?? []).includes(choiceId));
    if (choice?.hidden && !stillReferenced) deleteItem(choiceId);
  }

  // The rows shown in the editor: hidden items reachable via a chooser are
  // managed in the parent's Scelte panel, not as their own row.
  function visibleItems(group: MenuGroup): MenuItem[] {
    return group.items.filter((i) => !i.hidden || !referencedChoiceIds.has(i.id));
  }

  // --- Reordering ---

  // Move a visible item up/down within its group. The raw array interleaves
  // hidden choice items (skipped in the list), so swap by visible neighbours,
  // not by raw index — hidden items stay where they are.
  function moveItem(catId: string, groupLabel: string, itemId: string, dir: -1 | 1) {
    if (!catalog) return;
    catalog = {
      ...catalog,
      categories: catalog.categories.map((cat) => {
        if (cat.id !== catId) return cat;
        return {
          ...cat,
          groups: cat.groups.map((g) => {
            if (g.label !== groupLabel) return g;
            const visible = visibleItems(g);
            const vi = visible.findIndex((i) => i.id === itemId);
            const vt = vi + dir;
            if (vi < 0 || vt < 0 || vt >= visible.length) return g;
            const items = [...g.items];
            const a = items.indexOf(visible[vi]);
            const b = items.indexOf(visible[vt]);
            [items[a], items[b]] = [items[b], items[a]];
            return { ...g, items };
          })
        };
      })
    };
  }

  // Move a choice within its chooser: the picker order IS the choices array
  // order. Located by id, not display index — the rendered list skips ids that
  // don't resolve, so an index could point at the wrong entry.
  function moveChoice(parent: MenuItem, choiceId: string, dir: -1 | 1) {
    const ids = [...(parent.choices ?? [])];
    const index = ids.indexOf(choiceId);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    updateItem(parent.id, { choices: ids });
  }

  // --- Fascia colore ---

  // Same closed-set mapping idea as ItemBrowser: token → static class, so an
  // unknown token can never reach a class string. Solid fills for the swatches.
  const bandSwatchClasses: Record<BandColour, string> = {
    lampone: 'bg-rose-500',
    rame: 'bg-orange-500',
    bruno: 'bg-amber-800',
    ambra: 'bg-amber-400',
    oliva: 'bg-lime-600',
    verde: 'bg-green-600',
    smeraldo: 'bg-emerald-500',
    blu: 'bg-sky-500',
    indaco: 'bg-indigo-500',
    viola: 'bg-violet-500',
    ciclamino: 'bg-pink-500'
  };

  // Item id whose band popover is open, or null.
  let bandPickerFor = $state<string | null>(null);

  function setBand(itemId: string, band: BandColour | undefined) {
    updateItem(itemId, { band });
    bandPickerFor = null;
  }

  function updateCoperto(value: number) {
    if (!catalog) return;
    catalog = { ...catalog, coperto: { perPersona: value } };
  }

  function stationFor(item: MenuItem): string {
    return stations[item.id] ?? stationList[0] ?? FALLBACK_STATION;
  }

  function setStation(item: MenuItem, station: string) {
    // Apply to all variant and choice IDs too — they print where the parent prints.
    const next = { ...stations };
    next[item.id] = station;
    if (item.variants) {
      for (const v of item.variants) next[v.id] = station;
    }
    for (const id of item.choices ?? []) next[id] = station;
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
      <button
        type="button"
        onclick={resetToBundled}
        disabled={resetting || !catalog}
        class="px-3 py-1 rounded text-xs font-bold border border-amber-500 text-amber-200 hover:bg-amber-800/40 disabled:opacity-40"
      >
        {resetting ? '…' : 'Ripristina menu predefinito'}
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
      {#if copertoEnabled}
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
      {/if}
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
      {#if copertoEnabled && activeTab === '__coperto__'}
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
            {@const rows = visibleItems(group)}
            <!-- Group header -->
            <p class="text-xs font-bold uppercase tracking-wider text-gray-500 mt-4 mb-2 first:mt-0">{group.label}</p>

            <!-- Column headers -->
            <div class="grid grid-cols-[1fr_1fr_7rem_4rem_11rem_5.5rem] gap-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <span>Nome</span>
              <span>Descrizione</span>
              <span>Prezzo (€)</span>
              <span>Fascia</span>
              <span>Stazione</span>
              <span></span>
            </div>

            <!-- Item rows (hidden choice items are edited in their chooser's Scelte panel) -->
            <div class="flex flex-col gap-0.5">
              {#each rows as item, vi (item.id)}
                {@const band = normalizeBand(item.band)}
                <div class="grid grid-cols-[1fr_1fr_7rem_4rem_11rem_5.5rem] gap-2 items-start px-3 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100">
                  <!-- Name -->
                  <div>
                    <input
                      type="text"
                      value={item.name}
                      oninput={(e) => updateItem(item.id, { name: (e.target as HTMLInputElement).value })}
                      placeholder="Nome voce"
                      class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                    />
                    {#if item.variants?.length}
                      <p class="text-xs text-gray-400 mt-0.5 truncate">
                        varianti: {item.variants.map((v) => v.label).join(', ')}
                      </p>
                    {/if}
                    <button
                      type="button"
                      onclick={() => { choicesEditorFor = choicesEditorFor === item.id ? null : item.id; newChoiceName = ''; }}
                      class="mt-0.5 text-xs font-semibold {item.choices?.length ? 'text-green-700 hover:text-green-900' : 'text-gray-400 hover:text-gray-600'}"
                    >
                      {item.choices?.length ? `Scelte (${item.choices.length})` : '+ Scelte'}
                      {#if item.choices?.length}
                        <span class="font-normal text-gray-400">· {choicesOf(item).map((c) => c.name).join(' · ')}</span>
                      {/if}
                    </button>
                  </div>

                  <!-- Description -->
                  <input
                    type="text"
                    value={item.description ?? ''}
                    oninput={(e) => updateItem(item.id, { description: (e.target as HTMLInputElement).value || undefined })}
                    placeholder="—"
                    class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                  />

                  <!-- Price -->
                  <input
                    type="number"
                    min="0"
                    step="0.50"
                    value={item.price}
                    oninput={(e) => updateItem(item.id, { price: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                    class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                  />

                  <!-- Fascia colore -->
                  <div class="relative">
                    <button
                      type="button"
                      onclick={() => bandPickerFor = bandPickerFor === item.id ? null : item.id}
                      title={band ? `Fascia: ${band}` : 'Nessuna fascia'}
                      aria-label={band ? `Fascia colore: ${band}` : 'Scegli fascia colore'}
                      class="w-full h-[30px] rounded border border-gray-200 flex items-center justify-center hover:border-gray-400 {band ? bandSwatchClasses[band] : 'bg-white dark:bg-[#20242c]'}"
                    >
                      {#if !band}<span class="text-gray-300"><Ban size={14} /></span>{/if}
                    </button>

                    {#if bandPickerFor === item.id}
                      <button
                        type="button"
                        class="fixed inset-0 z-40 cursor-default"
                        aria-label="Chiudi selettore fascia"
                        onclick={() => bandPickerFor = null}
                      ></button>
                      <div class="absolute z-50 top-full right-0 mt-1 p-2 w-44 bg-white dark:bg-[#20242c] rounded-lg shadow-2xl border border-gray-200 grid grid-cols-6 gap-1.5">
                        <button
                          type="button"
                          onclick={() => setBand(item.id, undefined)}
                          title="Nessuna fascia"
                          aria-label="Nessuna fascia"
                          class="w-6 h-6 rounded border flex items-center justify-center text-gray-400 hover:border-gray-500 {band ? 'border-gray-200' : 'border-gray-700 dark:border-gray-300'}"
                        >
                          <Ban size={13} />
                        </button>
                        {#each BAND_COLOURS as token (token)}
                          <button
                            type="button"
                            onclick={() => setBand(item.id, token)}
                            title={token}
                            aria-label={`Fascia ${token}`}
                            class="w-6 h-6 rounded border {bandSwatchClasses[token]} {band === token ? 'border-gray-700 dark:border-gray-100 ring-1 ring-gray-700 dark:ring-gray-100' : 'border-transparent hover:border-gray-400'}"
                          ></button>
                        {/each}
                      </div>
                    {/if}
                  </div>

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

                  <!-- Move / Delete -->
                  <div class="flex items-center gap-0.5 pt-1">
                    <button
                      type="button"
                      onclick={() => moveItem(cat.id, group.label, item.id, -1)}
                      disabled={vi === 0}
                      class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                      title="Sposta su"
                    ><ChevronUp size={16} /></button>
                    <button
                      type="button"
                      onclick={() => moveItem(cat.id, group.label, item.id, 1)}
                      disabled={vi === rows.length - 1}
                      class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                      title="Sposta giù"
                    ><ChevronDown size={16} /></button>
                    <button
                      type="button"
                      onclick={() => deleteItem(item.id)}
                      class="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                      title="Elimina voce"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {#if choicesEditorFor === item.id}
                  <!-- Scelte panel: the picker this button opens on the till.
                       Each choice is a real (hidden) item with its own price. -->
                  <div class="ml-6 mb-2 px-3 py-3 rounded-lg border border-green-200 bg-green-50/50">
                    <p class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                      Scelte di "{item.name || 'voce'}" — alla cassa si apre una finestra per scegliere
                    </p>

                    <div class="flex flex-col gap-1">
                      {#each choicesOf(item) as choice, ci (choice.id)}
                        <div class="flex items-center gap-2">
                          <input
                            type="text"
                            value={choice.name}
                            oninput={(e) => updateItem(choice.id, { name: (e.target as HTMLInputElement).value })}
                            placeholder="Nome scelta"
                            class="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.50"
                            value={choice.price}
                            oninput={(e) => updateItem(choice.id, { price: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                            class="w-24 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                          />
                          <button
                            type="button"
                            onclick={() => moveChoice(item, choice.id, -1)}
                            disabled={ci === 0}
                            class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                            title="Sposta su"
                          ><ChevronUp size={16} /></button>
                          <button
                            type="button"
                            onclick={() => moveChoice(item, choice.id, 1)}
                            disabled={ci === choicesOf(item).length - 1}
                            class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                            title="Sposta giù"
                          ><ChevronDown size={16} /></button>
                          <button
                            type="button"
                            onclick={() => removeChoice(item, choice.id)}
                            class="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                            title="Rimuovi scelta"
                          ><X size={16} /></button>
                        </div>
                      {/each}
                    </div>

                    <div class="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        bind:value={newChoiceName}
                        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChoice(cat.id, group.label, item); } }}
                        placeholder="Nuova scelta (es. Shot Vodka)"
                        class="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                      />
                      <button
                        type="button"
                        onclick={() => addChoice(cat.id, group.label, item)}
                        class="px-3 py-1 rounded text-xs font-semibold text-green-700 border border-dashed border-green-300 hover:bg-green-50"
                      >
                        + Aggiungi
                      </button>
                    </div>

                    {#if item.choices?.length}
                      <label class="flex items-center gap-2 mt-3 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={!item.hideChoices}
                          onchange={(e) => updateItem(item.id, { hideChoices: (e.target as HTMLInputElement).checked ? undefined : true })}
                          class="accent-green-700"
                        />
                        Mostra l'elenco delle scelte sul pulsante della cassa
                      </label>
                    {/if}
                    <p class="text-xs text-gray-400 mt-2">
                      Il nome della scelta è quello stampato su comanda e scontrino. Le scelte stampano sulla stazione della voce principale.
                    </p>
                  </div>
                {/if}
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
