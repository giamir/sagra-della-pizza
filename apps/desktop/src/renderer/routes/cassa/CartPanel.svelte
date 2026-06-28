<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';
  import { adjLabel } from '@sagra/shared/utils/adjustments';

  type CartLine = { id: string; name: string; categoryLabel: string; price: number; qty: number; subtotal: number };
  type Adjustment = { id: number; amountCents: number; reason?: string };

  let {
    cartLines,
    categoryOrder,
    people,
    copertoPerPerson,
    adjustments,
    total,
    completing,
    orderSource,
    qrLoadTick,
    onInc,
    onDec,
    onRemove,
    onSetPeople,
    onAddAdjustment,
    onRemoveAdjustment,
    onComplete,
    onScanQr
  }: {
    cartLines: CartLine[];
    categoryOrder: string[];
    people: number;
    copertoPerPerson: number;
    adjustments: Adjustment[];
    total: number;
    completing: boolean;
    orderSource: 'manual' | 'qr';
    qrLoadTick: number;
    onInc: (id: string) => void;
    onDec: (id: string) => void;
    onRemove: (id: string) => void;
    onSetPeople: (n: number) => void;
    onAddAdjustment: () => void;
    onRemoveAdjustment: (id: number) => void;
    onComplete: () => void;
    onScanQr: () => void;
  } = $props();

  // One-shot pulse on the panel whenever a QR/phone order lands. The parent
  // bumps qrLoadTick each time loadFromPayload runs, so a back-to-back QR load
  // re-triggers the flash even though orderSource stays 'qr'.
  let flashing = $state(false);
  let flashTimer = 0;
  $effect(() => {
    void qrLoadTick; // track
    if (qrLoadTick > 0) {
      flashing = true;
      clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => { flashing = false; }, 1200);
    }
  });

  const isEmpty = $derived(cartLines.length === 0);
  const copertoTotal = $derived(people * copertoPerPerson);

  // Group lines by category, preserving menu order.
  const groupedLines = $derived.by(() => {
    const map = new Map<string, CartLine[]>();
    for (const line of cartLines) {
      const key = line.categoryLabel || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(line);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        const ai = categoryOrder.indexOf(a);
        const bi = categoryOrder.indexOf(b);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map(([label, lines]) => ({ label, lines }));
  });
</script>

<div class="flex flex-col w-[42%] bg-gray-50 overflow-hidden" class:qrFlash={flashing}>

  <!-- QR origin badge: persists for the whole life of a QR-loaded order -->
  {#if orderSource === 'qr'}
    <div class="shrink-0 flex items-center gap-2 bg-green-100 border-b border-green-300 text-green-900 px-3 py-2 text-sm font-bold">
      <span class="text-lg leading-none">📷</span>
      <span>Ordine dal QR cliente — verifica e incassa</span>
    </div>
  {/if}

  <!-- Lines -->
  <div class="flex-1 overflow-y-auto px-3 pt-3 pb-1">
    <div class="space-y-3">

      <!-- Coperto (always first, before menu groups) -->
      <ul class="space-y-1">
        <li class="flex items-center gap-2 bg-white dark:bg-[#20242c] rounded-lg px-2 py-2 border border-gray-100">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold leading-tight truncate">Coperto</p>
            <p class="text-xs text-gray-500">{formatEUR(copertoPerPerson)} × {people} = {formatEUR(copertoTotal)}</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onclick={() => onSetPeople(people - 1)}
              disabled={people <= 0}
              class="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30 font-bold text-base leading-none"
            >−</button>
            <span class="w-6 text-center text-sm font-bold tabular-nums">{people}</span>
            <button
              type="button"
              onclick={() => onSetPeople(people + 1)}
              class="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-100 font-bold text-base leading-none"
            >+</button>
          </div>
        </li>
      </ul>

      {#if isEmpty}
        <div class="flex flex-col items-center justify-center gap-3 pt-10 text-gray-400">
          <span class="text-4xl">🧾</span>
          <p class="font-semibold text-sm">Carrello vuoto</p>
          <p class="text-xs text-center">Seleziona articoli dal menu<br>o scansiona il QR del cliente</p>
          <button
            type="button"
            onclick={onScanQr}
            class="mt-2 px-4 py-2 rounded-full border-2 border-green-700 text-green-800 font-bold text-sm hover:bg-green-50"
          >
            Scansiona QR
          </button>
        </div>
      {:else}
        {#each groupedLines as group}
          <div>
            {#if group.label}
              <p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 px-1">{group.label}</p>
            {/if}
            <ul class="space-y-1">
              {#each group.lines as line (line.id)}
                <li class="flex items-center gap-2 bg-white dark:bg-[#20242c] rounded-lg px-2 py-2 border border-gray-100">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold leading-tight truncate">{line.name}</p>
                    <p class="text-xs text-gray-500">{formatEUR(line.price)} × {line.qty} = {formatEUR(line.subtotal)}</p>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onclick={() => onDec(line.id)}
                      class="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-100 font-bold text-base leading-none"
                    >−</button>
                    <span class="w-6 text-center text-sm font-bold tabular-nums">{line.qty}</span>
                    <button
                      type="button"
                      onclick={() => onInc(line.id)}
                      class="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-100 font-bold text-base leading-none"
                    >+</button>
                    <button
                      type="button"
                      onclick={() => onRemove(line.id)}
                      class="w-7 h-7 flex items-center justify-center rounded border border-red-200 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 ml-1 text-lg leading-none"
                      aria-label="Rimuovi"
                    >×</button>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}

      <!-- Ad-hoc adjustments (sconto / supplemento) -->
      {#if adjustments.length}
        <ul class="space-y-1">
          {#each adjustments as adj (adj.id)}
            <li class="flex items-center gap-2 bg-white dark:bg-[#20242c] rounded-lg px-2 py-2 border border-gray-100">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold leading-tight truncate" class:text-red-700={adj.amountCents < 0}>
                  {adj.reason || adjLabel(adj.amountCents)}
                </p>
                <p class="text-xs text-gray-500">{adj.amountCents < 0 ? '−' : '+'}{formatEUR(Math.abs(adj.amountCents) / 100)}</p>
              </div>
              <button
                type="button"
                onclick={() => onRemoveAdjustment(adj.id)}
                class="w-7 h-7 flex items-center justify-center rounded border border-red-200 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 text-lg leading-none"
                aria-label="Rimuovi"
              >×</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Footer: total, actions -->
  <div class="shrink-0 border-t border-gray-200 bg-white dark:bg-[#20242c] px-3 pb-3 pt-2 space-y-2">

    <!-- Add adjustment -->
    <button
      type="button"
      onclick={onAddAdjustment}
      class="w-full py-2 rounded-lg border border-gray-300 text-gray-600 font-semibold text-sm hover:bg-gray-100"
    >
      + Sconto / Supplemento
    </button>

    <!-- Total -->
    <div class="flex items-center justify-between bg-green-900 text-white rounded-lg px-3 py-2">
      <span class="font-bold text-sm uppercase tracking-wide">Totale</span>
      <span class="text-2xl font-bold tabular-nums">{formatEUR(total)}</span>
    </div>

    <!-- Actions -->
    <button
      type="button"
      onclick={onComplete}
      disabled={isEmpty || completing}
      class="w-full py-3 rounded-lg bg-red-700 hover:bg-red-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-base transition-colors"
    >
      {completing ? 'Salvataggio…' : 'Completa ordine'}
    </button>

  </div>

</div>

<style>
  @keyframes qrFlash {
    0%   { box-shadow: inset 0 0 0 4px rgba(21, 128, 61, 0.9); }
    100% { box-shadow: inset 0 0 0 4px rgba(21, 128, 61, 0); }
  }
  .qrFlash {
    animation: qrFlash 1.2s ease-out;
  }
</style>
