<script lang="ts">
  import { onMount } from 'svelte';

  let { onClose }: { onClose: () => void } = $props();

  type StationConfig = { name: string; enabled: boolean };
  type Config = {
    enabled: boolean;
    connectionType: 'tcp' | 'usb';
    host: string;
    port: number;
    usbTarget: string;
    width: number;
    tcpTimeoutMs: number;
    tcpCloseDelayMs: number;
    usbWriteMode: 'auto' | 'cups' | 'file';
    usbPrintCommand: 'lp' | 'lpr';
    usbRawOption: string;
    stations: StationConfig[];
  };

  let config = $state<Config>({
    enabled: false, connectionType: 'tcp', host: '192.168.1.100', port: 9100,
    usbTarget: '', width: 42, tcpTimeoutMs: 5000, tcpCloseDelayMs: 200,
    usbWriteMode: 'auto', usbPrintCommand: 'lp', usbRawOption: 'raw', stations: []
  });
  let saving = $state(false);
  let testing = $state(false);
  let loadingPrinters = $state(false);
  let advancedOpen = $state(false);
  let availablePrinters = $state<string[]>([]);
  let message = $state<{ ok: boolean; text: string } | null>(null);

  onMount(async () => {
    try {
      config = await withTimeout(window.api.getPrinterConfig(), 'Caricamento configurazione stampante scaduto.');
    } catch (err) {
      message = { ok: false, text: errorMessage(err, 'Impossibile caricare la configurazione stampante.') };
    }
  });

  function normalizedConfig(): Config {
    const snap = $state.snapshot(config) as Config;
    return {
      ...snap,
      port: Number(snap.port),
      width: Number(snap.width),
      tcpTimeoutMs: Number(snap.tcpTimeoutMs),
      tcpCloseDelayMs: Number(snap.tcpCloseDelayMs)
    };
  }

  function validateConfig(nextConfig: Config): string | null {
    if (!nextConfig.enabled) return null;
    if (![32, 42, 48].includes(nextConfig.width)) return 'Seleziona una larghezza carta valida.';

    if (nextConfig.connectionType === 'tcp') {
      if (!nextConfig.host.trim()) return 'Inserisci l’indirizzo IP della stampante.';
      if (!Number.isInteger(nextConfig.port) || nextConfig.port < 1 || nextConfig.port > 65535) {
        return 'Inserisci una porta stampante valida tra 1 e 65535.';
      }
      if (!Number.isInteger(nextConfig.tcpTimeoutMs) || nextConfig.tcpTimeoutMs < 500 || nextConfig.tcpTimeoutMs > 60000) {
        return 'Inserisci un timeout TCP tra 500 e 60000 ms.';
      }
      if (!Number.isInteger(nextConfig.tcpCloseDelayMs) || nextConfig.tcpCloseDelayMs < 0 || nextConfig.tcpCloseDelayMs > 5000) {
        return 'Inserisci una pausa chiusura TCP tra 0 e 5000 ms.';
      }
    }

    if (nextConfig.connectionType === 'usb' && !nextConfig.usbTarget.trim()) {
      return 'Seleziona o inserisci il nome della stampante USB.';
    }

    if (!['auto', 'cups', 'file'].includes(nextConfig.usbWriteMode)) {
      return 'Seleziona una modalità USB valida.';
    }

    return null;
  }

  function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string' && err) return err;
    return fallback;
  }

  async function withTimeout<T>(promise: Promise<T>, timeoutMessage: string, ms = 10000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function persistConfig(): Promise<void> {
    const nextConfig = normalizedConfig();
    const validationError = validateConfig(nextConfig);
    if (validationError) throw new Error(validationError);

    const result = await withTimeout(
      window.api.savePrinterConfig(nextConfig),
      'Salvataggio configurazione stampante scaduto. Verifica che l’app desktop sia ancora in esecuzione.'
    );
    if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
      throw new Error('error' in result && typeof result.error === 'string' ? result.error : 'Errore salvataggio configurazione stampante.');
    }
  }

  async function save() {
    saving = true;
    message = null;
    try {
      await persistConfig();
      message = { ok: true, text: 'Configurazione salvata.' };
      setTimeout(() => { message = null; }, 3000);
    } catch (err) {
      message = { ok: false, text: errorMessage(err, 'Errore salvataggio configurazione stampante.') };
    } finally {
      saving = false;
    }
  }

  async function testPrint() {
    testing = true;
    message = null;
    try {
      await persistConfig();
      const result = await withTimeout(
        window.api.printTest(),
        'Stampa test scaduta. Controlla collegamento, indirizzo e porta della stampante.',
        15000
      );
      message = { ok: result.ok, text: result.ok ? 'Stampa test inviata!' : result.error };
    } catch (err) {
      message = { ok: false, text: errorMessage(err, 'Errore stampa test.') };
    } finally {
      testing = false;
    }
  }

  async function loadPrinters() {
    loadingPrinters = true;
    try {
      const result = await withTimeout(window.api.listPrinters(), 'Ricerca stampanti scaduta.');
      availablePrinters = result.printers ?? [];
      if (availablePrinters.length === 0) {
        message = { ok: false, text: 'Nessuna stampante trovata. Assicurati che sia collegata e installata nel sistema.' };
      }
    } catch (err) {
      message = { ok: false, text: errorMessage(err, 'Impossibile cercare le stampanti.') };
    } finally {
      loadingPrinters = false;
    }
  }

  function toggleAll(enabled: boolean) {
    config.stations = config.stations.map((s) => ({ ...s, enabled }));
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Impostazioni stampante"
  tabindex="-1"
  class="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
    <div class="flex items-center justify-between px-6 pt-5 pb-3">
      <h2 class="font-bold text-gray-900">Stampante termica</h2>
      <button type="button" onclick={onClose} class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
    </div>

    <div class="flex-1 overflow-y-auto px-6 space-y-4 pb-4">

      <!-- Enable toggle -->
      <label class="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" bind:checked={config.enabled} class="w-5 h-5 accent-green-800" />
        <span class="font-semibold text-gray-800">Stampante abilitata</span>
      </label>

      <fieldset class="space-y-3" class:opacity-40={!config.enabled} class:pointer-events-none={!config.enabled}>

        <!-- Connection type selector -->
        <div>
          <p class="text-sm font-semibold text-gray-700 mb-2">Connessione</p>
          <div class="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onclick={() => config.connectionType = 'tcp'}
              class="flex-1 py-2 text-sm font-semibold transition-colors"
              class:bg-green-800={config.connectionType === 'tcp'}
              class:text-white={config.connectionType === 'tcp'}
              class:text-gray-600={config.connectionType !== 'tcp'}
              class:hover:bg-gray-50={config.connectionType !== 'tcp'}
            >
              Rete (LAN)
            </button>
            <button
              type="button"
              onclick={() => config.connectionType = 'usb'}
              class="flex-1 py-2 text-sm font-semibold transition-colors border-l border-gray-200"
              class:bg-green-800={config.connectionType === 'usb'}
              class:text-white={config.connectionType === 'usb'}
              class:text-gray-600={config.connectionType !== 'usb'}
              class:hover:bg-gray-50={config.connectionType !== 'usb'}
            >
              USB
            </button>
          </div>
        </div>

        <!-- TCP fields -->
        {#if config.connectionType === 'tcp'}
          <label class="block">
            <span class="text-sm font-semibold text-gray-700">Indirizzo IP</span>
            <input
              type="text"
              bind:value={config.host}
              placeholder="192.168.1.100"
              class="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label class="block">
            <span class="text-sm font-semibold text-gray-700">Porta</span>
            <input
              type="number"
              bind:value={config.port}
              min="1" max="65535"
              class="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
        {/if}

        <!-- USB fields -->
        {#if config.connectionType === 'usb'}
          <div>
            <div class="flex items-end gap-2 mb-1">
              <span class="text-sm font-semibold text-gray-700">Stampante</span>
              <button
                type="button"
                onclick={loadPrinters}
                disabled={loadingPrinters}
                class="ml-auto text-xs text-green-800 font-semibold hover:underline disabled:opacity-40"
              >
                {loadingPrinters ? 'Ricerca…' : 'Cerca stampanti'}
              </button>
            </div>

            {#if availablePrinters.length > 0}
              <select
                bind:value={config.usbTarget}
                class="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="">— seleziona —</option>
                {#each availablePrinters as p}
                  <option value={p}>{p}</option>
                {/each}
              </select>
            {:else}
              <input
                type="text"
                bind:value={config.usbTarget}
                placeholder="Es. NomePrinter oppure /dev/usb/lp0"
                class="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            {/if}
            <p class="text-xs text-gray-400 mt-1">
              Su macOS: nome della stampante installata in Impostazioni di Sistema.<br>
              Su Linux: nome CUPS o percorso come <code>/dev/usb/lp0</code>.<br>
              Su Windows: <code>COM3</code> o <code>LPT1:</code>.
            </p>
          </div>
        {/if}

        <!-- Width (shared) -->
        <label class="block">
          <span class="text-sm font-semibold text-gray-700">Larghezza carta</span>
          <select bind:value={config.width} class="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <option value={32}>32 col · 58 mm</option>
            <option value={42}>42 col · 80 mm</option>
            <option value={48}>48 col · 80 mm</option>
          </select>
        </label>

        <div class="rounded-lg border border-gray-200 overflow-hidden">
          <button
            type="button"
            onclick={() => advancedOpen = !advancedOpen}
            class="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <span>Risoluzione problemi avanzata</span>
            <span class="text-gray-400">{advancedOpen ? '−' : '+'}</span>
          </button>

          {#if advancedOpen}
            <div class="border-t border-gray-100 p-3 space-y-3 bg-gray-50/60">
              {#if config.connectionType === 'tcp'}
                <div class="grid grid-cols-2 gap-2">
                  <label class="block">
                    <span class="text-xs font-semibold text-gray-600">Timeout TCP (ms)</span>
                    <input
                      type="number"
                      bind:value={config.tcpTimeoutMs}
                      min="500"
                      max="60000"
                      class="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                    />
                  </label>
                  <label class="block">
                    <span class="text-xs font-semibold text-gray-600">Pausa chiusura (ms)</span>
                    <input
                      type="number"
                      bind:value={config.tcpCloseDelayMs}
                      min="0"
                      max="5000"
                      class="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                    />
                  </label>
                </div>
              {:else}
                <label class="block">
                  <span class="text-xs font-semibold text-gray-600">Modalità invio USB</span>
                  <select bind:value={config.usbWriteMode} class="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
                    <option value="auto">Automatica</option>
                    <option value="cups">Forza CUPS</option>
                    <option value="file">Scrittura diretta</option>
                  </select>
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <label class="block">
                    <span class="text-xs font-semibold text-gray-600">Comando CUPS</span>
                    <select bind:value={config.usbPrintCommand} class="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
                      <option value="lp">lp</option>
                      <option value="lpr">lpr</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-xs font-semibold text-gray-600">Opzione raw</span>
                    <input
                      type="text"
                      bind:value={config.usbRawOption}
                      placeholder="raw"
                      class="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                    />
                  </label>
                </div>
                <p class="text-xs text-gray-500">Usa queste opzioni solo se la stampa test fallisce con la configurazione normale.</p>
              {/if}
            </div>
          {/if}
        </div>
      </fieldset>

      <!-- Stations -->
      {#if config.stations.length > 0}
        <div class:opacity-40={!config.enabled} class:pointer-events-none={!config.enabled}>
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-gray-700">Comande da stampare</span>
            <div class="flex gap-2">
              <button type="button" onclick={() => toggleAll(true)} class="text-xs text-green-800 font-semibold hover:underline">Tutte</button>
              <span class="text-gray-300">|</span>
              <button type="button" onclick={() => toggleAll(false)} class="text-xs text-gray-500 font-semibold hover:underline">Nessuna</button>
            </div>
          </div>
          <div class="rounded-lg border border-gray-200 divide-y divide-gray-100">
            {#each config.stations as station (station.name)}
              <label class="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" bind:checked={station.enabled} class="w-4 h-4 accent-green-800" />
                <span class="text-sm font-medium text-gray-800">{station.name}</span>
              </label>
            {/each}
          </div>
          <p class="text-xs text-gray-400 mt-1.5">Le stazioni abilitate ricevono una comanda separata per ogni ordine.</p>
        </div>
      {/if}

      <!-- Status message -->
      {#if message}
        <p
          class="text-sm font-semibold rounded-lg px-3 py-2"
          class:bg-green-100={message.ok}
          class:text-green-900={message.ok}
          class:bg-red-100={!message.ok}
          class:text-red-900={!message.ok}
        >{message.text}</p>
      {/if}
    </div>

    <!-- Actions -->
    <div class="px-6 pb-5 pt-2 flex gap-2 border-t border-gray-100">
      <button
        type="button"
        onclick={testPrint}
        disabled={testing || !config.enabled}
        class="flex-1 py-2 rounded-lg border-2 border-green-800 text-green-800 font-bold text-sm disabled:opacity-40"
      >
        {testing ? 'Invio…' : 'Stampa test'}
      </button>
      <button
        type="button"
        onclick={save}
        disabled={saving}
        class="flex-1 py-2 rounded-lg bg-green-800 text-white font-bold text-sm disabled:opacity-40"
      >
        {saving ? 'Salvo…' : 'Salva'}
      </button>
    </div>
  </div>
</div>
