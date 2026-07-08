<script lang="ts">
  import StepHeader from '$lib/components/StepHeader.svelte';
  import { qrEnabled } from '$lib/config/tenant';
  import { MENU, clearOrder, order, total } from '$lib/stores/order.svelte';
  import { formatEUR } from '$lib/utils/currency';
  import { buildPriceIndex, decodeCartKey } from '@sagra/shared/utils/pricing';

  const linesByCategory = $derived.by(() => {
    // Single source of truth for names/prices — includes composite keys that
    // carry variants and/or add-on options (e.g. "hot-dog||ketchup,maionese").
    const idx = buildPriceIndex(MENU);

    // Map every base item/variant id to its category, preserving menu order so
    // both the categories and the lines within them stay in menu sequence.
    const base = new Map<string, { catId: string; catLabel: string; catOrd: number; itemOrd: number }>();
    let itemOrd = 0;
    MENU.categories.forEach((cat, catOrd) => {
      for (const group of cat.groups) {
        for (const item of group.items) {
          base.set(item.id, { catId: cat.id, catLabel: cat.label, catOrd, itemOrd: itemOrd++ });
          for (const variant of item.variants ?? []) {
            base.set(variant.id, { catId: cat.id, catLabel: cat.label, catOrd, itemOrd: itemOrd++ });
          }
        }
      }
    });

    const byCat = new Map<
      string,
      {
        categoryId: string;
        categoryLabel: string;
        catOrd: number;
        lines: Array<{ id: string; name: string; price: number; qty: number; itemOrd: number }>;
      }
    >();
    for (const [key, qty] of Object.entries(order.lines)) {
      if (qty <= 0) continue;
      const { itemId } = decodeCartKey(key);
      const cat = base.get(itemId);
      const info = idx[key];
      if (!cat || !info) continue;
      if (!byCat.has(cat.catId)) {
        byCat.set(cat.catId, {
          categoryId: cat.catId,
          categoryLabel: cat.catLabel,
          catOrd: cat.catOrd,
          lines: []
        });
      }
      byCat.get(cat.catId)!.lines.push({ id: key, name: info.name, price: info.price, qty, itemOrd: cat.itemOrd });
    }

    return [...byCat.values()]
      .sort((a, b) => a.catOrd - b.catOrd)
      .map((c) => ({
        categoryId: c.categoryId,
        categoryLabel: c.categoryLabel,
        lines: c.lines
          .sort((a, b) => a.itemOrd - b.itemOrd || a.name.localeCompare(b.name))
          .map(({ id, name, price, qty }) => ({ id, name, price, qty }))
      }));
  });

  const t = $derived(total());
  const copertoTot = $derived(MENU.coperto.perPersona * order.people);
  const isEmpty = $derived(linesByCategory.length === 0);
</script>

<StepHeader
  title="Il tuo ordine"
  subtitle={qrEnabled
    ? 'Controlla tutto prima di mostrare il QR alla cassa'
    : 'Controlla tutto e ordina alla cassa'}
/>

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

    {#if qrEnabled}
      <a
        href="/qr"
        class="block text-center w-full px-6 py-5 min-h-16 rounded-full bg-tomato hover:bg-tomato-dark text-white text-2xl font-bold shadow-lg"
      >
        Conferma e mostra il QR
      </a>
    {/if}

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
