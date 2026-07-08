<script lang="ts">
  import { dec, getQty, inc, order } from '$lib/stores/order.svelte';
  import type { MenuItem, MenuOption } from '$lib/types';
  import { formatEUR } from '$lib/utils/currency';
  import { encodeCartKey, decodeCartKey, optionsForItem } from '@sagra/shared/utils/pricing';

  type Props = { item: MenuItem; categoryOptions?: MenuOption[] };
  let { item, categoryOptions = [] }: Props = $props();

  // Options this specific item offers (drops customizableOnly ones unless customizable).
  const itemOptions = $derived(optionsForItem(item, categoryOptions));

  const usesModal = $derived(
    itemOptions.length > 0 || (!!item.optionalVariants && !!item.variants?.length)
  );

  // All non-plain entries in the cart that belong to this item (added via modal)
  const modalLines = $derived.by(() => {
    if (!usesModal) return [];
    const lines: { key: string; label: string; qty: number }[] = [];
    for (const [key, qty] of Object.entries(order.lines)) {
      if (qty <= 0 || key === item.id) continue;
      const { itemId: baseKey, optionIds } = decodeCartKey(key);
      const isNormaleWithOptions = baseKey === item.id && optionIds.length > 0;
      const variant = item.variants?.find((v) => v.id === baseKey);
      if (!isNormaleWithOptions && !variant) continue;
      const optLabels = optionIds.map((oid) => categoryOptions.find((o) => o.id === oid)?.label ?? oid);
      // Variant items keep their cottura label (with any options in parens);
      // option-only items (no variants) just list the options.
      let label = variant
        ? optLabels.length
          ? `${variant.label} (${optLabels.join(', ')})`
          : variant.label
        : optLabels.join(', ');
      lines.push({ key, label, qty });
    }
    return lines;
  });

  let modalOpen = $state(false);
  let selectedVariantId = $state<string | null>(null); // null = Normale
  let selectedOptions = $state(new Set<string>());

  const extraPrice = $derived(
    [...selectedOptions].reduce((s, id) => s + (categoryOptions.find((o) => o.id === id)?.priceDelta ?? 0), 0)
  );

  function openModal() {
    selectedVariantId = null;
    selectedOptions = new Set();
    modalOpen = true;
  }

  function toggleOption(optId: string) {
    const next = new Set(selectedOptions);
    if (next.has(optId)) next.delete(optId);
    else next.add(optId);
    selectedOptions = next;
  }

  function handleModalAdd() {
    const baseId = selectedVariantId ?? item.id;
    inc(encodeCartKey(baseId, [...selectedOptions].sort()));
    modalOpen = false;
  }
</script>

<div class="py-3 border-b border-cream-200 last:border-b-0">
  <div class="flex items-start gap-3">
    <div class="flex-1 min-w-0">
      <div class="text-xl font-semibold text-ink leading-tight">{item.name}</div>
      {#if item.description}
        <div class="mt-1 text-base text-ink/75 leading-snug">{item.description}</div>
      {/if}
      <div class="text-lg text-leaf font-medium flex items-baseline gap-2">
        {formatEUR(item.price)}
        {#if usesModal}
          <button
            type="button"
            onclick={openModal}
            class="text-sm font-medium text-ink/40 hover:text-leaf transition-colors"
          >opzioni</button>
        {/if}
      </div>
    </div>

    {#if !item.variants?.length || usesModal}
      {@const qty = getQty(item.id)}
      <div class="flex items-center gap-2 shrink-0" role="group" aria-label={`Quantità di ${item.name}`}>
        <button
          type="button"
          onclick={() => dec(item.id)}
          disabled={qty === 0}
          aria-label={`Diminuisci quantità di ${item.name}`}
          class="w-12 h-12 rounded-full bg-cream-100 hover:bg-cream-200 disabled:bg-cream-100 border-2 border-leaf text-leaf text-2xl font-bold flex items-center justify-center"
        >−</button>
        <div class="w-10 text-center text-2xl font-bold tabular-nums text-ink" aria-live="polite" aria-atomic="true">{qty}</div>
        <button
          type="button"
          onclick={() => inc(item.id)}
          aria-label={`Aumenta quantità di ${item.name}`}
          class="w-12 h-12 rounded-full bg-tomato hover:bg-tomato-dark text-white text-2xl font-bold flex items-center justify-center"
        >+</button>
      </div>
    {/if}
  </div>

  {#if usesModal && modalLines.length > 0}
    <div class="mt-1.5 flex flex-wrap gap-1.5">
      {#each modalLines as line (line.key)}
        <span class="inline-flex items-center gap-1 text-sm font-medium text-ink/70 bg-cream-100 rounded-full px-2.5 py-0.5">
          {line.qty}× {line.label}
          <button
            type="button"
            onclick={() => dec(line.key)}
            aria-label={`Rimuovi una ${line.label}`}
            class="text-ink/40 hover:text-tomato leading-none"
          >×</button>
        </span>
      {/each}
    </div>
  {/if}

  {#if item.variants?.length && !usesModal}
    <div class="mt-3 ml-3 border-l-4 border-cream-200 pl-3">
      {#each item.variants as variant (variant.id)}
        {@const qty = getQty(variant.id)}
        <div class="flex items-center gap-3 py-2">
          <div class="flex-1 text-lg font-semibold text-ink">{variant.label}</div>
          <div class="flex items-center gap-2 shrink-0" role="group" aria-label={`Quantità di ${item.name} ${variant.label}`}>
            <button type="button" onclick={() => dec(variant.id)} disabled={qty === 0}
              aria-label={`Diminuisci ${item.name} ${variant.label}`}
              class="w-11 h-11 rounded-full bg-cream-100 disabled:bg-cream-100 border-2 border-leaf text-leaf text-xl font-bold">−</button>
            <div class="w-9 text-center text-xl font-bold tabular-nums text-ink" aria-live="polite" aria-atomic="true">{qty}</div>
            <button type="button" onclick={() => inc(variant.id)}
              aria-label={`Aumenta ${item.name} ${variant.label}`}
              class="w-11 h-11 rounded-full bg-tomato text-white text-xl font-bold">+</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if modalOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    role="dialog"
    aria-modal="true"
    aria-label={`Opzioni per ${item.name}`}
    tabindex="-1"
    class="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) modalOpen = false; }}
    onkeydown={(e) => { if (e.key === 'Escape') modalOpen = false; }}
  >
    <div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
      <h2 class="text-xl font-bold text-ink mb-1">{item.name}</h2>
      <p class="text-base text-leaf font-semibold mb-5">{formatEUR(item.price + extraPrice)}</p>

      {#if item.variants?.length}
        <p class="text-xs font-bold uppercase tracking-wider text-ink/40 mb-2">Base</p>
        <div class="space-y-2 mb-5">
          {#each [{ id: null, label: 'Normale' }, ...item.variants.map(v => ({ id: v.id, label: v.label }))] as opt}
            {@const active = selectedVariantId === opt.id}
            <button
              type="button"
              onclick={() => { selectedVariantId = opt.id; }}
              class="w-full py-3 px-4 rounded-xl border-2 text-left flex items-center gap-3 transition-colors"
              class:border-leaf={active}
              class:bg-leaf={active}
              class:border-cream-200={!active}
              class:hover:border-leaf={!active}
            >
              <span
                class="w-4 h-4 rounded-full border-2 shrink-0"
                class:bg-white={active}
                class:border-white={active}
                class:border-cream-300={!active}
              ></span>
              <span class="font-semibold" class:text-white={active} class:text-ink={!active}>{opt.label}</span>
            </button>
          {/each}
        </div>
      {/if}

      {#if itemOptions.length > 0}
        <p class="text-xs font-bold uppercase tracking-wider text-ink/40 mb-2">Opzioni</p>
        <div class="space-y-2 mb-5">
          {#each itemOptions as opt}
            {@const checked = selectedOptions.has(opt.id)}
            <button
              type="button"
              onclick={() => toggleOption(opt.id)}
              class="w-full py-3 px-4 rounded-xl border-2 text-left flex items-center gap-3 transition-colors"
              class:border-leaf={checked}
              class:bg-cream-100={checked}
              class:border-cream-200={!checked}
              class:hover:border-leaf={!checked}
            >
              <span
                class="w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center"
                class:bg-leaf={checked}
                class:border-leaf={checked}
                class:border-cream-300={!checked}
              >
                {#if checked}
                  <svg class="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </span>
              <span class="flex-1 font-semibold text-ink">{opt.label}</span>
              {#if opt.priceDelta !== 0}
                <span class="text-sm font-semibold text-leaf">+{formatEUR(opt.priceDelta)}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      <div class="flex gap-3">
        <button
          type="button"
          onclick={() => modalOpen = false}
          class="flex-1 py-3 rounded-full border-2 border-cream-200 text-ink/60 font-semibold"
        >Annulla</button>
        <button
          type="button"
          onclick={handleModalAdd}
          class="flex-1 py-3 rounded-full bg-tomato text-white font-bold"
        >Aggiungi</button>
      </div>
    </div>
  </div>
{/if}
