<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { tenant, themeCssVars } from '$lib/config/tenant';

  let offline = $state(false);
  let { children } = $props();

  const pageTitle = `${tenant.brand.name} ${tenant.brand.location}`;
  const pageDescription = `Ordina alla ${tenant.brand.name} di ${tenant.brand.location}.`;

  onMount(() => {
    const updateConnection = () => {
      offline = !navigator.onLine;
    };

    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);

    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />
  <meta name="theme-color" content={tenant.theme.themeColor} />
  <meta name="apple-mobile-web-app-title" content={tenant.brand.shortName} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags — tenant config is trusted -->
  {@html `<style>${themeCssVars()}</style>`}
</svelte:head>

<a href="#main" class="skip-link">Salta al contenuto</a>

<div class="min-h-dvh flex flex-col bg-cream-50">
  {#if offline}
    <div class="bg-leaf text-white px-4 py-2 text-center text-sm font-semibold" role="status">
      Modalità offline: puoi continuare a preparare e mostrare l'ordine.
    </div>
  {/if}
  <main id="main" class="flex-1 flex flex-col">
    {@render children()}
  </main>
</div>
