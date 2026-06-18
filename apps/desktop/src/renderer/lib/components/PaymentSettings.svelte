<script lang="ts">
  import { onMount } from 'svelte';

  let { onClose }: { onClose: () => void } = $props();

  let enabled = $state(false);
  let host = $state('192.168.1.50');
  let port = $state(7500);
  let saving = $state(false);
  let message = $state<string | null>(null);

  onMount(async () => {
    const c = await window.api.getPaymentConfig();
    enabled = c.enabled;
    host = c.host;
    port = c.port;
  });

  async function save() {
    saving = true;
    message = null;
    try {
      await window.api.savePaymentConfig({ enabled, host, port });
      message = 'Salvato';
      setTimeout(() => { message = null; onClose(); }, 800);
    } catch {
      message = 'Errore salvataggio';
    } finally {
      saving = false;
    }
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Impostazioni terminale"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
  onclick={(e) => { if ((e.target as Element) === (e.currentTarget as Element)) onClose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
    <div class="flex items-center justify-between">
      <h2 class="font-bold text-lg text-gray-900">Terminale Nexi / ECR17</h2>
      <button type="button" onclick={onClose} class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
    </div>

    <!-- Enable toggle -->
    <div class="flex items-center gap-3">
      <div
        role="switch"
        aria-checked={enabled}
        aria-label="Abilita pagamento con carta"
        tabindex="0"
        onclick={() => enabled = !enabled}
        onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') enabled = !enabled; }}
        class="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
        class:bg-green-600={enabled}
        class:bg-gray-300={!enabled}
      >
        <span
          class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
          class:translate-x-5={enabled}
        ></span>
      </div>
      <button type="button" onclick={() => enabled = !enabled}
        class="text-sm font-semibold text-gray-700 text-left bg-transparent border-0 p-0 cursor-pointer">
        Abilita pagamento con carta
      </button>
    </div>

    {#if enabled}
      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold text-gray-700">IP terminale</span>
        <input
          type="text"
          bind:value={host}
          placeholder="192.168.1.50"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold text-gray-700">Porta TCP</span>
        <input
          type="number"
          bind:value={port}
          min="1"
          max="65535"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        />
        <span class="text-xs text-gray-400">Configurata sul terminale (Nexi SmartPOS: 8220)</span>
      </label>
    {/if}

    <div class="flex items-center justify-between pt-1">
      {#if message}
        <span class="text-sm font-medium" class:text-green-700={message === 'Salvato'} class:text-red-600={message !== 'Salvato'}>{message}</span>
      {:else}
        <span></span>
      {/if}
      <div class="flex gap-3">
        <button type="button" onclick={onClose}
          class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">
          Annulla
        </button>
        <button type="button" onclick={save} disabled={saving}
          class="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-bold hover:bg-green-800 disabled:opacity-50">
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </div>
  </div>
</div>
