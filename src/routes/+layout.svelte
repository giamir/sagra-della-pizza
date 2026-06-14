<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';

  let offline = $state(false);
  let { children } = $props();

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
