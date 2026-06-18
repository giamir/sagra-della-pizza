<script lang="ts">
  let {
    stations,
    receipt,
    error,
    onClose
  }: {
    stations: { name: string; text: string }[];
    receipt: string;
    error: string;
    onClose: () => void;
  } = $props();

  let activeTab = $state<string>('');
  const tab = $derived(activeTab || stations[0]?.name || 'receipt');
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Anteprima scontrino"
  tabindex="-1"
  class="absolute inset-0 z-40 bg-black/70 flex items-center justify-center p-4"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
    <div class="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
      <div>
        <h2 class="font-bold text-gray-900">Anteprima stampa</h2>
        <p class="text-sm text-amber-700 mt-0.5">{error}</p>
      </div>
      <button type="button" onclick={onClose} class="text-gray-400 hover:text-gray-700 text-2xl leading-none mt-0.5">×</button>
    </div>

    <div class="flex gap-1 px-5 pb-2 overflow-x-auto">
      {#each stations as s}
        <button
          type="button"
          onclick={() => activeTab = s.name}
          class="shrink-0 px-3 py-1.5 rounded text-sm font-semibold transition-colors"
          class:bg-green-800={tab === s.name}
          class:text-white={tab === s.name}
          class:text-gray-500={tab !== s.name}
          class:hover:text-gray-800={tab !== s.name}
        >{s.name}</button>
      {/each}
      <button
        type="button"
        onclick={() => activeTab = 'receipt'}
        class="shrink-0 px-3 py-1.5 rounded text-sm font-semibold transition-colors"
        class:bg-green-800={tab === 'receipt'}
        class:text-white={tab === 'receipt'}
        class:text-gray-500={tab !== 'receipt'}
        class:hover:text-gray-800={tab !== 'receipt'}
      >Ricevuta</button>
    </div>

    <div class="flex-1 overflow-y-auto px-5 pb-5">
      {#if tab === 'receipt'}
        <pre class="font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre leading-5">{receipt}</pre>
      {:else}
        {@const station = stations.find((s) => s.name === tab)}
        {#if station}
          <pre class="font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre leading-5">{station.text}</pre>
        {/if}
      {/if}
    </div>

    <div class="px-5 pb-5">
      <button type="button" onclick={onClose} class="w-full py-2 rounded-lg bg-green-800 text-white font-bold hover:bg-green-700">
        Chiudi
      </button>
    </div>
  </div>
</div>
