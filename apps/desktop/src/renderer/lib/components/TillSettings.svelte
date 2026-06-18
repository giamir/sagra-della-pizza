<script lang="ts">
  import { onMount } from 'svelte';

  let { onClose }: { onClose: () => void } = $props();

  let tillName = $state('');
  let role = $state<'host' | 'client'>('host');
  let hostUrl = $state('http://192.168.1.10:7331');
  let serverPort = $state(7331);
  let saving = $state(false);
  let message = $state<string | null>(null);

  onMount(async () => {
    const s = await window.api.getSettings();
    tillName = s.tillName;
    role = s.role;
    hostUrl = s.hostUrl;
    serverPort = s.serverPort;
  });

  async function save() {
    saving = true;
    message = null;
    try {
      await window.api.saveSettings({ tillName, role, hostUrl, serverPort });
      message = 'Salvato';
      setTimeout(() => { message = null; onClose(); }, 800);
    } catch {
      message = 'Errore salvataggio';
    } finally {
      saving = false;
    }
  }

  function handleBackdrop(e: MouseEvent) {
    if ((e.target as Element) === (e.currentTarget as Element)) onClose();
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Impostazioni cassa"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
  onclick={handleBackdrop}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">
    <div class="flex items-center justify-between">
      <h2 class="font-bold text-lg text-gray-900">Impostazioni Cassa</h2>
      <button type="button" onclick={onClose} class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
    </div>

    <!-- Till name -->
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold text-gray-700">Nome cassa</span>
      <input
        type="text"
        bind:value={tillName}
        placeholder="Cassa 1"
        class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
      />
    </label>

    <!-- Role toggle -->
    <div class="flex flex-col gap-2">
      <span class="text-sm font-semibold text-gray-700">Ruolo</span>
      <div class="flex gap-3">
        <button
          type="button"
          onclick={() => role = 'host'}
          class="flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-colors"
          class:border-green-700={role === 'host'}
          class:bg-green-50={role === 'host'}
          class:text-green-900={role === 'host'}
          class:border-gray-200={role !== 'host'}
          class:text-gray-500={role !== 'host'}
        >
          Host (Server)
        </button>
        <button
          type="button"
          onclick={() => role = 'client'}
          class="flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-colors"
          class:border-green-700={role === 'client'}
          class:bg-green-50={role === 'client'}
          class:text-green-900={role === 'client'}
          class:border-gray-200={role !== 'client'}
          class:text-gray-500={role !== 'client'}
        >
          Client
        </button>
      </div>
    </div>

    {#if role === 'host'}
      <!-- Server port -->
      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold text-gray-700">Porta server</span>
        <input
          type="number"
          bind:value={serverPort}
          min="1024"
          max="65535"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        />
        <span class="text-xs text-gray-400">Le altre casse si connetteranno a questa macchina sulla porta indicata.</span>
      </label>
    {:else}
      <!-- Host URL -->
      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold text-gray-700">URL host</span>
        <input
          type="text"
          bind:value={hostUrl}
          placeholder="http://192.168.1.10:7331"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        />
        <span class="text-xs text-gray-400">Indirizzo IP del computer host sulla rete locale.</span>
      </label>
    {/if}

    <!-- Actions -->
    <div class="flex items-center justify-between pt-1">
      {#if message}
        <span class="text-sm font-medium" class:text-green-700={message === 'Salvato'} class:text-red-600={message !== 'Salvato'}>{message}</span>
      {:else}
        <span></span>
      {/if}
      <div class="flex gap-3">
        <button
          type="button"
          onclick={onClose}
          class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Annulla
        </button>
        <button
          type="button"
          onclick={save}
          disabled={saving}
          class="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-bold hover:bg-green-800 disabled:opacity-50"
        >
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </div>
  </div>
</div>
