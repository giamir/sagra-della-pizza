<script lang="ts">
  import StepHeader from '$lib/components/StepHeader.svelte';
  import { MENU, clearOrder, order, total } from '$lib/stores/order.svelte';
  import { formatEUR } from '$lib/utils/currency';

  const linesByCategory = $derived.by(() => {
    const out: Array<{
      categoryLabel: string;
      categoryId: string;
      lines: Array<{ id: string; name: string; price: number; qty: number }>;
    }> = [];
    for (const cat of MENU.categories) {
      const lines: Array<{ id: string; name: string; price: number; qty: number }> = [];
      for (const group of cat.groups) {
        for (const item of group.items) {
          if (item.variants?.length) {
            for (const variant of item.variants) {
              const qty = order.lines[variant.id] ?? 0;
              if (qty > 0) {
                lines.push({
                  id: variant.id,
                  name: `${item.name} - ${variant.label}`,
                  price: item.price,
                  qty
                });
              }
            }
          } else {
            const qty = order.lines[item.id] ?? 0;
            if (qty > 0) lines.push({ id: item.id, name: item.name, price: item.price, qty });
          }
        }
      }
      if (lines.length) out.push({ categoryLabel: cat.label, categoryId: cat.id, lines });
    }
    return out;
  });

  const t = $derived(total());
  const copertoTot = $derived(MENU.coperto.perPersona * order.people);
  const isEmpty = $derived(linesByCategory.length === 0);
</script>

<StepHeader title="Il tuo ordine" subtitle="Controlla tutto prima di mostrare il QR alla cassa" />

<div class="px-4 pb-32 max-w-2xl mx-auto w-full">
  {#if isEmpty}
    <p class="text-center text-xl text-ink py-10">
      Non hai ancora scelto niente. Torna indietro e aggiungi qualcosa!
    </p>
  {:else}
    <ul class="mb-3 border-y border-cream-200">
      <li class="grid grid-cols-[2rem_1fr_auto_auto] items-center gap-2 py-1.5">
        <div
          class="text-sm font-bold tabular-nums text-leaf"
          aria-label={`Quantità: ${order.people}`}
        >
          {order.people}×
        </div>
        <div class="min-w-0 truncate text-sm font-semibold text-ink">Coperto</div>
        <a
          href="/ordina/persone"
          class="text-xs text-leaf underline underline-offset-2"
        >
          Modifica
        </a>
        <div class="text-sm font-bold tabular-nums text-ink">{formatEUR(copertoTot)}</div>
      </li>
    </ul>

    {#each linesByCategory as cat (cat.categoryId)}
      <section class="mb-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold uppercase tracking-wide text-tomato">
            {cat.categoryLabel}
          </h2>
          <a
            href={`/ordina/${cat.categoryId}`}
            class="text-xs text-leaf underline underline-offset-2 min-h-8 inline-flex items-center px-1"
          >
            Modifica
          </a>
        </div>
        <ul class="divide-y divide-cream-200 border-y border-cream-200">
          {#each cat.lines as line (line.id)}
            <li class="grid grid-cols-[2rem_1fr_auto] items-center gap-2 py-1.5">
              <div class="text-sm font-bold tabular-nums text-leaf" aria-label={`Quantità: ${line.qty}`}>
                {line.qty}×
              </div>
              <div class="min-w-0 truncate text-sm font-semibold text-ink">{line.name}</div>
              <div class="text-sm font-bold tabular-nums text-ink">
                {formatEUR(line.price * line.qty)}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <div class="bg-leaf text-cream-50 rounded-lg px-4 py-4 mb-6 flex items-center justify-between">
      <div class="text-xl font-semibold">Totale</div>
      <div class="text-3xl font-bold tabular-nums">{formatEUR(t)}</div>
    </div>

    <a
      href="/qr"
      class="block text-center w-full px-6 py-5 min-h-16 rounded-full bg-tomato hover:bg-tomato-dark text-white text-2xl font-bold shadow-lg"
    >
      Conferma e mostra il QR
    </a>

    <button
      type="button"
      onclick={() => {
        if (confirm('Sicuro di voler svuotare il carrello?')) clearOrder();
      }}
      class="mt-4 block mx-auto text-base text-leaf underline underline-offset-4 min-h-12"
    >
      Svuota il carrello
    </button>
  {/if}
</div>
