<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';
  import { encodeCartKey } from '@sagra/shared/utils/pricing';
  import type { MenuItem, MenuOption } from '@sagra/shared/types';

  let {
    item,
    options,
    variants,
    baseId = item.id,
    baseName = item.name,
    onAdd,
    onClose
  }: {
    item: MenuItem;
    options: MenuOption[];
    variants?: Array<{ id: string; label: string }>;
    baseId?: string;
    baseName?: string;
    onAdd: (key: string) => void;
    onClose: () => void;
  } = $props();

  // null = no preference (use baseId as-is)
  let selectedVariantId = $state<string | null>(null);
  let selected = $state(new Set<string>());

  function toggleOption(optId: string) {
    const next = new Set(selected);
    if (next.has(optId)) next.delete(optId);
    else next.add(optId);
    selected = next;
  }

  function selectVariant(id: string | null) {
    selectedVariantId = id;
  }

  const extraPrice = $derived(
    [...selected].reduce((s, id) => s + (options.find((o) => o.id === id)?.priceDelta ?? 0), 0)
  );

  function handleAdd() {
    const effectiveBaseId = selectedVariantId ?? baseId;
    onAdd(encodeCartKey(effectiveBaseId, [...selected].sort()));
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Opzioni"
  tabindex="-1"
  class="absolute inset-0 z-30 bg-black/60 flex items-center justify-center"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="bg-white rounded-2xl shadow-2xl p-6 w-80 max-w-[90vw]">
    <h2 class="text-lg font-bold text-gray-900 mb-1">{baseName}</h2>
    {#if item.description}
      <p class="text-sm text-gray-500 mb-3">{item.description}</p>
    {/if}

    {#if variants?.length}
      <p class="text-sm font-semibold text-gray-600 mb-2">Base</p>
      <div class="space-y-2 mb-4">
        <button
          type="button"
          onclick={() => selectVariant(null)}
          class="w-full py-2.5 px-4 rounded-xl border-2 text-left flex items-center gap-3 transition-colors"
          class:border-green-700={selectedVariantId === null}
          class:bg-green-50={selectedVariantId === null}
          class:border-gray-200={selectedVariantId !== null}
          class:hover:border-gray-300={selectedVariantId !== null}
        >
          <span
            class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
            class:bg-green-700={selectedVariantId === null}
            class:border-green-700={selectedVariantId === null}
            class:border-gray-300={selectedVariantId !== null}
          ></span>
          <span class="flex-1 font-semibold text-gray-900 text-sm">Normale</span>
        </button>
        {#each variants as v}
          <button
            type="button"
            onclick={() => selectVariant(v.id)}
            class="w-full py-2.5 px-4 rounded-xl border-2 text-left flex items-center gap-3 transition-colors"
            class:border-green-700={selectedVariantId === v.id}
            class:bg-green-50={selectedVariantId === v.id}
            class:border-gray-200={selectedVariantId !== v.id}
            class:hover:border-gray-300={selectedVariantId !== v.id}
          >
            <span
              class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
              class:bg-green-700={selectedVariantId === v.id}
              class:border-green-700={selectedVariantId === v.id}
              class:border-gray-300={selectedVariantId !== v.id}
            ></span>
            <span class="flex-1 font-semibold text-gray-900 text-sm">{v.label}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if options.length}
      <p class="text-sm font-semibold text-gray-600 mb-2">Opzioni aggiuntive</p>
      <div class="space-y-2 mb-5">
        {#each options as opt}
          {@const checked = selected.has(opt.id)}
          <button
            type="button"
            onclick={() => toggleOption(opt.id)}
            class="w-full py-2.5 px-4 rounded-xl border-2 text-left flex items-center gap-3 transition-colors"
            class:border-green-700={checked}
            class:bg-green-50={checked}
            class:border-gray-200={!checked}
            class:hover:border-gray-300={!checked}
          >
            <span
              class="w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors"
              class:bg-green-700={checked}
              class:border-green-700={checked}
              class:border-gray-300={!checked}
            >
              {#if checked}
                <svg class="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {/if}
            </span>
            <span class="flex-1 font-semibold text-gray-900 text-sm">{opt.label}</span>
            {#if opt.priceDelta !== 0}
              <span class="text-sm font-semibold text-green-700">+{formatEUR(opt.priceDelta)}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <!-- Total -->
    <div class="flex items-center justify-between mb-4 px-1">
      <span class="text-sm text-gray-500">Totale voce</span>
      <span class="font-bold text-gray-900">{formatEUR(item.price + extraPrice)}</span>
    </div>

    <div class="flex gap-2">
      <button
        type="button"
        onclick={onClose}
        class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50"
      >
        Annulla
      </button>
      <button
        type="button"
        onclick={handleAdd}
        class="flex-1 py-2.5 rounded-xl bg-green-800 text-white font-bold text-sm hover:bg-green-700"
      >
        Aggiungi
      </button>
    </div>
  </div>
</div>
