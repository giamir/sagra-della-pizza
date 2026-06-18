<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';

  type CartLine = { id: string; name: string; categoryLabel: string; price: number; qty: number; subtotal: number };

  let {
    cartLines,
    categoryOrder,
    people,
    copertoPerPerson,
    total,
    completing,
    onInc,
    onDec,
    onRemove,
    onSetPeople,
    onComplete,
    onScanQr
  }: {
    cartLines: CartLine[];
    categoryOrder: string[];
    people: number;
    copertoPerPerson: number;
    total: number;
    completing: boolean;
    onInc: (id: string) => void;
    onDec: (id: string) => void;
    onRemove: (id: string) => void;
    onSetPeople: (n: number) => void;
    onComplete: () => void;
    onScanQr: () => void;
  } = $props();

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

<div class="flex flex-col w-[42%] bg-gray-50 overflow-hidden">

  <!-- Lines -->
  <div class="flex-1 overflow-y-auto px-3 pt-3 pb-1">
    {#if isEmpty}
      <div class="h-full flex flex-col items-center justify-center gap-3 text-gray-400">
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
      <div class="space-y-3">
        {#each groupedLines as group}
          <div>
            {#if group.label}
              <p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 px-1">{group.label}</p>
            {/if}
            <ul class="space-y-1">
              {#each group.lines as line (line.id)}
                <li class="flex items-center gap-2 bg-white rounded-lg px-2 py-2 border border-gray-100">
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
                      class="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 ml-1 text-lg leading-none"
                      aria-label="Rimuovi"
                    >×</button>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Footer: coperto, total, actions -->
  <div class="shrink-0 border-t border-gray-200 bg-white px-3 pb-3 pt-2 space-y-2">

    <!-- Coperto row -->
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-gray-700">
        Coperto · {formatEUR(copertoPerPerson)} × {people}
      </span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={() => onSetPeople(people - 1)}
          disabled={people <= 0}
          class="w-8 h-8 flex items-center justify-center rounded border border-gray-200 font-bold text-base hover:bg-gray-50 disabled:opacity-30"
        >−</button>
        <span class="w-6 text-center font-bold tabular-nums text-sm">{people}</span>
        <button
          type="button"
          onclick={() => onSetPeople(people + 1)}
          class="w-8 h-8 flex items-center justify-center rounded border border-gray-200 font-bold text-base hover:bg-gray-50"
        >+</button>
        <span class="w-16 text-right text-sm font-semibold tabular-nums text-gray-700">
          {formatEUR(copertoTotal)}
        </span>
      </div>
    </div>

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

    {#if !isEmpty}
      <button
        type="button"
        onclick={onScanQr}
        class="w-full py-2 rounded-lg border-2 border-green-700 text-green-800 font-bold text-sm hover:bg-green-50"
      >
        Carica da QR (sostituisce ordine)
      </button>
    {/if}
  </div>

</div>
