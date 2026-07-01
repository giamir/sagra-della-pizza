<script lang="ts">
  import { goto } from '$app/navigation';
  import { clearOrder, count } from '$lib/stores/order.svelte';
  import { qrEnabled, tenant } from '$lib/config/tenant';

  const hasOrder = $derived(count() > 0);
  let cashierTaps = 0;
  let cashierTapTimer: ReturnType<typeof setTimeout> | undefined;

  function handleLogoTap() {
    cashierTaps += 1;
    clearTimeout(cashierTapTimer);

    if (cashierTaps >= 5) {
      cashierTaps = 0;
      goto('/cassa');
      return;
    }

    cashierTapTimer = setTimeout(() => {
      cashierTaps = 0;
    }, 2000);
  }
</script>

<div class="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
  <div class="max-w-md">
    <button
      type="button"
      onclick={handleLogoTap}
      aria-label={tenant.brand.logoAlt}
      class="block mx-auto mb-6 rounded-full"
    >
      <img
        src={tenant.brand.logo}
        alt=""
        width="256"
        height="256"
        class="w-28 sm:w-32 h-auto rounded-full mix-blend-multiply"
      />
    </button>
    <h1 class="text-4xl sm:text-5xl font-bold text-leaf leading-tight">
      {tenant.brand.name}
    </h1>
    <p class="mt-3 text-xl font-semibold tracking-wide uppercase text-tomato">{tenant.brand.location}</p>
    <p class="mt-6 text-xl text-ink">
      {tenant.brand.tagline}
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
      {qrEnabled
        ? "Una volta confermato, mostra il QR all'addetto della cassa per pagare."
        : "Prepara il tuo ordine e comunicalo all'addetto della cassa."}
    </p>
  </div>
</div>
