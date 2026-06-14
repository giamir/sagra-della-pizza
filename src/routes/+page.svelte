<script lang="ts">
  import { clearOrder, count } from '$lib/stores/order.svelte';

  const hasOrder = $derived(count() > 0);
</script>

<div class="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
  <div class="max-w-md">
    <img
      src="/ente-carnevale-dei-bambini.png"
      alt="Ente Carnevale dei Bambini"
      width="256"
      height="256"
      class="w-28 sm:w-32 h-auto mx-auto mb-6 rounded-full mix-blend-multiply"
    />
    <h1 class="text-4xl sm:text-5xl font-bold text-leaf leading-tight">
      Sagra della Pizza
    </h1>
    <p class="mt-3 text-xl font-semibold tracking-wide uppercase text-tomato">Orentano</p>
    <p class="mt-6 text-xl text-ink">
      Ordina mentre sei in fila. Mostra il QR alla cassa: il tuo ordine sarà già pronto!
    </p>

    <div class="mt-10 flex flex-col gap-4">
      <a
        href="/ordina/persone"
        class="inline-flex items-center justify-center px-8 py-4 min-h-16 rounded-full bg-tomato hover:bg-tomato-dark text-white text-2xl font-bold shadow-lg"
      >
        {hasOrder ? 'Continua il tuo ordine' : 'Inizia il tuo ordine'}
      </a>
      {#if hasOrder}
        <button
          type="button"
          onclick={clearOrder}
          class="text-base text-leaf underline underline-offset-4 min-h-12"
        >
          Ricomincia da capo
        </button>
      {/if}
    </div>

    <p class="mt-10 text-sm text-ink/70">
      Una volta confermato, mostra il QR all'addetto della cassa per pagare.
    </p>
  </div>
</div>
