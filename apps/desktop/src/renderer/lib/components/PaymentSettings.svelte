<script lang="ts">
  import { onMount } from 'svelte';

  let { onClose }: { onClose: () => void } = $props();

  let enabled = $state(false);
  let host = $state('192.168.1.50');
  let port = $state(7500);
  let timeoutMs = $state(120000);
  let fieldSeparatorHex = $state('1C');
  let lrcSeedHex = $state('7F');
  let lrcIncludesStx = $state(false);
  let purchaseCode = $state('01');
  let cancelCode = $state('05');
  let amountDigits = $state(9);
  let sendAckOnResponse = $state(true);
  let sendAckOnCancel = $state(true);
  let saving = $state(false);
  let testing = $state(false);
  let advancedOpen = $state(false);
  let message = $state<{ ok: boolean; text: string } | null>(null);

  onMount(async () => {
    const c = await window.api.getPaymentConfig();
    enabled = c.enabled;
    host = c.host;
    port = c.port;
    timeoutMs = c.timeoutMs ?? 120000;
    fieldSeparatorHex = c.fieldSeparatorHex ?? '1C';
    lrcSeedHex = c.lrcSeedHex ?? '7F';
    lrcIncludesStx = c.lrcIncludesStx ?? false;
    purchaseCode = c.purchaseCode ?? '01';
    cancelCode = c.cancelCode ?? '05';
    amountDigits = c.amountDigits ?? 9;
    sendAckOnResponse = c.sendAckOnResponse ?? true;
    sendAckOnCancel = c.sendAckOnCancel ?? true;
  });

  function normalizedConfig() {
    return {
      enabled,
      host,
      port: Number(port),
      timeoutMs: Number(timeoutMs),
      fieldSeparatorHex: fieldSeparatorHex.trim().replace(/^0x/i, '').toUpperCase(),
      lrcSeedHex: lrcSeedHex.trim().replace(/^0x/i, '').toUpperCase(),
      lrcIncludesStx,
      purchaseCode: purchaseCode.trim(),
      cancelCode: cancelCode.trim(),
      amountDigits: Number(amountDigits),
      sendAckOnResponse,
      sendAckOnCancel
    };
  }

  function validateConfig(config = normalizedConfig()): string | null {
    if (!config.enabled) return null;
    if (!config.host.trim()) return 'Inserisci l’IP del terminale.';
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      return 'Inserisci una porta TCP valida tra 1 e 65535.';
    }
    if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 5000 || config.timeoutMs > 300000) {
      return 'Inserisci un timeout tra 5000 e 300000 ms.';
    }
    if (!/^[0-9A-F]{1,2}$/.test(config.fieldSeparatorHex)) return 'Separatore campo non valido.';
    if (!/^[0-9A-F]{1,2}$/.test(config.lrcSeedHex)) return 'Seed LRC non valido.';
    if (!config.purchaseCode) return 'Inserisci il codice vendita.';
    if (!config.cancelCode) return 'Inserisci il codice annullo.';
    if (!Number.isInteger(config.amountDigits) || config.amountDigits < 1 || config.amountDigits > 12) {
      return 'Inserisci un numero cifre importo tra 1 e 12.';
    }
    return null;
  }

  async function persistConfig() {
    const config = normalizedConfig();
    const validationError = validateConfig(config);
    if (validationError) throw new Error(validationError);
    await window.api.savePaymentConfig(config);
  }

  function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string' && err) return err;
    return fallback;
  }

  async function save() {
    saving = true;
    message = null;
    try {
      await persistConfig();
      message = { ok: true, text: 'Salvato' };
      setTimeout(() => { message = null; onClose(); }, 800);
    } catch (err) {
      message = { ok: false, text: errorMessage(err, 'Errore salvataggio') };
    } finally {
      saving = false;
    }
  }

  async function testConnection() {
    testing = true;
    message = null;
    try {
      await persistConfig();
      const result = await window.api.testPaymentConnection();
      message = { ok: result.ok, text: result.ok ? 'Terminale raggiungibile.' : result.error };
    } catch (err) {
      message = { ok: false, text: errorMessage(err, 'Errore test connessione') };
    } finally {
      testing = false;
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
  <div class="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[92vh] overflow-hidden">
    <div class="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
      <h2 class="font-bold text-lg text-gray-900">Terminale Nexi / ECR17</h2>
      <button type="button" onclick={onClose} class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      <!-- Enable toggle -->
      <div class="flex items-center gap-3">
        <div
          role="switch"
          aria-checked={enabled}
          aria-label="Abilita pagamento con carta"
          tabindex="0"
          onclick={() => enabled = !enabled}
          onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') enabled = !enabled; }}
          class="relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0"
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
        <div class="grid grid-cols-2 gap-2">
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
          </label>
        </div>
        <p class="text-xs text-gray-400 -mt-3">Configurata sul terminale (Nexi SmartPOS: 8220)</p>

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
            <div class="border-t border-gray-100 p-3 bg-gray-50/60">
              <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1">
                  <span class="text-xs font-semibold text-gray-600">Timeout (ms)</span>
                  <input
                    type="number"
                    bind:value={timeoutMs}
                    min="5000"
                    max="300000"
                    class="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-xs font-semibold text-gray-600">Cifre importo</span>
                  <input
                    type="number"
                    bind:value={amountDigits}
                    min="1"
                    max="12"
                    class="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-xs font-semibold text-gray-600">Separatore</span>
                  <input
                    type="text"
                    bind:value={fieldSeparatorHex}
                    placeholder="1C"
                    class="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-xs font-semibold text-gray-600">Seed LRC</span>
                  <input
                    type="text"
                    bind:value={lrcSeedHex}
                    placeholder="7F"
                    class="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-xs font-semibold text-gray-600">Vendita</span>
                  <input
                    type="text"
                    bind:value={purchaseCode}
                    class="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-xs font-semibold text-gray-600">Annullo</span>
                  <input
                    type="text"
                    bind:value={cancelCode}
                    class="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </label>
              </div>

              <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label class="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <input type="checkbox" bind:checked={lrcIncludesStx} class="w-4 h-4 accent-green-800 shrink-0" />
                  <span>LRC include STX</span>
                </label>
                <label class="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <input type="checkbox" bind:checked={sendAckOnResponse} class="w-4 h-4 accent-green-800 shrink-0" />
                  <span>ACK risposta</span>
                </label>
                <label class="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <input type="checkbox" bind:checked={sendAckOnCancel} class="w-4 h-4 accent-green-800 shrink-0" />
                  <span>ACK annullo</span>
                </label>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
      {#if message}
        <span class="text-sm font-medium min-w-0" class:text-green-700={message.ok} class:text-red-600={!message.ok}>{message.text}</span>
      {:else}
        <span></span>
      {/if}
      <div class="flex gap-2 shrink-0">
        <button type="button" onclick={testConnection} disabled={testing || !enabled}
          class="px-3 py-2 rounded-lg border border-green-700 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50">
          {testing ? 'Verifica…' : 'Test'}
        </button>
        <button type="button" onclick={onClose}
          class="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">
          Annulla
        </button>
        <button type="button" onclick={save} disabled={saving}
          class="px-3 py-2 rounded-lg bg-green-700 text-white text-sm font-bold hover:bg-green-800 disabled:opacity-50">
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </div>
  </div>
</div>
