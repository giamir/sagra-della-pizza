<script lang="ts">
  import StepHeader from '$lib/components/StepHeader.svelte';
  import { MENU, clearOrder, dec, inc, order, total } from '$lib/stores/order.svelte';
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
  <div class="bg-cream-100 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
    <div>
      <div class="text-sm uppercase tracking-wide text-leaf font-semibold">Tavolo</div>
      <div class="text-2xl font-bold text-ink">
        {order.people} {order.people === 1 ? 'persona' : 'persone'}
      </div>
    </div>
    <a
      href="/ordina/persone"
      class="text-base text-leaf underline underline-offset-4 min-h-12 inline-flex items-center px-2"
    >
      Modifica
    </a>
  </div>

  {#if isEmpty}
    <p class="text-center text-xl text-ink py-10">
      Non hai ancora scelto niente. Torna indietro e aggiungi qualcosa!
    </p>
  {:else}
    {#each linesByCategory as cat (cat.categoryId)}
      <section class="mb-6">
        <div class="flex items-baseline justify-between mb-2">
          <h2 class="text-xl font-bold text-tomato">{cat.categoryLabel}</h2>
          <a
            href={`/ordina/${cat.categoryId}`}
            class="text-base text-leaf underline underline-offset-4 min-h-12 inline-flex items-center px-2"
          >
            Modifica
          </a>
        </div>
        <ul class="bg-cream-100 rounded-lg divide-y divide-cream-200">
          {#each cat.lines as line (line.id)}
            <li class="flex items-center gap-3 px-3 py-3">
              <div class="flex-1 min-w-0">
                <div class="text-lg font-semibold text-ink leading-tight">{line.name}</div>
                <div class="text-sm text-leaf">
                  {formatEUR(line.price)} × {line.qty} = <strong>{formatEUR(line.price * line.qty)}</strong>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onclick={() => dec(line.id)}
                  aria-label={`Diminuisci ${line.name}`}
                  class="w-10 h-10 rounded-full bg-cream-50 border-2 border-leaf text-leaf text-xl font-bold"
                >
                  −
                </button>
                <div class="w-8 text-center text-xl font-bold tabular-nums">{line.qty}</div>
                <button
                  type="button"
                  onclick={() => inc(line.id)}
                  aria-label={`Aumenta ${line.name}`}
                  class="w-10 h-10 rounded-full bg-tomato text-white text-xl font-bold"
                >
                  +
                </button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <div class="bg-cream-100 rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
      <div>
        <div class="text-lg font-semibold text-ink">Pane e coperto</div>
        <div class="text-sm text-leaf">
          {formatEUR(MENU.coperto.perPersona)} × {order.people}
        </div>
      </div>
      <div class="text-xl font-bold tabular-nums">{formatEUR(copertoTot)}</div>
    </div>

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
