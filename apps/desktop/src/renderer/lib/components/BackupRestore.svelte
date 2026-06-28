<script lang="ts">
  let { onClose }: { onClose: () => void } = $props();

  let exporting = $state(false);
  let importing = $state(false);
  let resetting = $state(false);
  let resetConfirm = $state('');
  let statusMsg = $state<{ text: string; ok: boolean } | null>(null);

  const RESET_WORD = 'AZZERA';

  function showStatus(text: string, ok = true) {
    statusMsg = { text, ok };
  }

  async function exportDb() {
    exporting = true;
    statusMsg = null;
    try {
      const result = await window.api.exportDatabase();
      if (result.cancelled) {
        // user dismissed dialog — no message needed
      } else if (result.ok) {
        showStatus(`Salvato in: ${result.filePath}`);
      } else {
        showStatus(result.error ?? 'Errore esportazione', false);
      }
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Errore esportazione', false);
    } finally {
      exporting = false;
    }
  }

  async function importDb() {
    const ok = window.confirm(
      'Sostituisce TUTTI gli ordini, le scorte e i dati di cassa di questa postazione con quelli del file scelto.\n\nLa configurazione di stampante, pagamento e rete NON viene toccata.\n\nContinuare?'
    );
    if (!ok) return;

    importing = true;
    statusMsg = null;
    try {
      const result = await window.api.importDatabase();
      if (result.cancelled) {
        // user dismissed dialog — no message needed
      } else if (result.ok) {
        showStatus(`Importati ${result.orders} ordini. Riapri Rapporti per vedere i dati.`);
      } else {
        showStatus(result.error ?? 'Errore importazione', false);
      }
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Errore importazione', false);
    } finally {
      importing = false;
    }
  }

  async function resetDb() {
    if (resetConfirm.trim().toUpperCase() !== RESET_WORD) return;

    resetting = true;
    statusMsg = null;
    try {
      const result = await window.api.resetDatabase();
      if (result.ok) {
        resetConfirm = '';
        showStatus(`Database azzerato (${result.orders} ordini eliminati). Una copia di sicurezza è stata salvata automaticamente.`);
      } else {
        showStatus(result.error ?? 'Errore azzeramento', false);
      }
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Errore azzeramento', false);
    } finally {
      resetting = false;
    }
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Backup / Ripristino"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-white dark:bg-[#20242c] flex flex-col"
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <!-- App bar -->
  <div class="shrink-0 h-12 bg-green-900 text-white flex items-center px-4 gap-3">
    <button type="button" onclick={onClose} class="text-green-200 hover:text-white font-bold text-sm mr-1">← Cassa</button>
    <span class="font-bold tracking-wide text-sm uppercase">Backup / Ripristino</span>

    {#if statusMsg}
      <span class="text-sm {statusMsg.ok ? 'text-green-200' : 'text-red-300'} truncate">{statusMsg.text}</span>
    {/if}
  </div>

  <!-- Content area -->
  <div class="flex-1 overflow-y-auto px-4 py-6">
    <div class="max-w-xl mx-auto flex flex-col gap-5">

      <!-- Export -->
      <section class="bg-white dark:bg-[#20242c] border border-gray-200 rounded-xl p-4">
        <h2 class="text-lg font-bold text-green-900">Esporta database</h2>
        <p class="text-sm text-gray-600 mt-1">
          Salva un file <code>.json</code> con tutti gli ordini, le scorte, i dati di cassa
          e il catalogo di questa postazione. Il file può essere trasferito su un'altra
          postazione (anche Windows) e importato lì.
        </p>
        <button
          type="button"
          onclick={exportDb}
          disabled={exporting}
          class="mt-3 px-6 py-3 min-h-12 rounded-full bg-green-700 hover:bg-green-800 text-white font-bold disabled:opacity-40"
        >
          {exporting ? 'Esportazione…' : 'Esporta su file'}
        </button>
      </section>

      <!-- Import -->
      <section class="bg-white dark:bg-[#20242c] border border-gray-200 rounded-xl p-4">
        <h2 class="text-lg font-bold text-green-900">Importa database</h2>
        <p class="text-sm text-gray-600 mt-1">
          Carica un file di backup per <strong>sostituire</strong> i dati di questa
          postazione. La configurazione di stampante, terminale di pagamento e rete
          rimane invariata.
        </p>
        <div class="mt-2 text-sm bg-red-100 text-red-800 rounded-lg px-3 py-2">
          ⚠ Operazione irreversibile: gli ordini e i dati di cassa attuali verranno cancellati.
        </div>
        <button
          type="button"
          onclick={importDb}
          disabled={importing}
          class="mt-3 px-6 py-3 min-h-12 rounded-full border-2 border-green-700 text-green-700 font-bold hover:bg-green-50 disabled:opacity-40"
        >
          {importing ? 'Importazione…' : 'Importa da file'}
        </button>
      </section>

      <!-- Reset -->
      <section class="bg-white dark:bg-[#20242c] border-2 border-red-300 rounded-xl p-4">
        <h2 class="text-lg font-bold text-red-700">Azzera database</h2>
        <p class="text-sm text-gray-600 mt-1">
          Elimina <strong>tutti</strong> gli ordini, le scorte e i dati di cassa di questa
          postazione, riportandola allo stato di inizio sagra. Il catalogo e la
          configurazione di stampante, terminale di pagamento e rete rimangono invariati.
        </p>
        <div class="mt-2 text-sm bg-red-100 text-red-800 rounded-lg px-3 py-2">
          ⚠ Operazione irreversibile. Una copia di sicurezza del database viene salvata
          automaticamente prima dell'azzeramento.
        </div>
        <label class="block text-sm text-gray-700 mt-3" for="reset-confirm">
          Per confermare, scrivi <strong>{RESET_WORD}</strong> qui sotto:
        </label>
        <input
          id="reset-confirm"
          type="text"
          bind:value={resetConfirm}
          autocomplete="off"
          spellcheck="false"
          placeholder={RESET_WORD}
          class="mt-1 w-48 px-3 py-2 rounded-lg border border-gray-300 text-base uppercase tracking-widest focus:border-red-500 focus:outline-none"
        />
        <div>
          <button
            type="button"
            onclick={resetDb}
            disabled={resetting || resetConfirm.trim().toUpperCase() !== RESET_WORD}
            class="mt-3 px-6 py-3 min-h-12 rounded-full bg-red-700 hover:bg-red-800 text-white font-bold disabled:opacity-40"
          >
            {resetting ? 'Azzeramento…' : 'Azzera database'}
          </button>
        </div>
      </section>

    </div>
  </div>
</div>
