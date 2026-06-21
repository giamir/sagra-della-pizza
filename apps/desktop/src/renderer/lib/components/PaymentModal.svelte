<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';

  type PaymentState = 'choose' | 'cash' | 'waiting' | 'approved' | 'declined' | 'error';

  let {
    totalCents,
    onCash,
    onCardApproved,
    onClose,
  }: {
    totalCents: number;
    onCash: () => void;
    onCardApproved: (authCode: string) => void;
    onClose: () => void;
  } = $props();

  let state = $state<PaymentState>('choose');
  let errorMessage = $state('');
  let authCode = $state('');

  const total = $derived(totalCents / 100);

  // --- Cash / change calculator (display-only, nothing persisted) ---
  let receivedCents = $state(0);
  const changeCents = $derived(receivedCents - totalCents);
  const enough = $derived(receivedCents >= totalCents);

  const MAX_CENTS = 99999999; // €999.999,99

  // Coins and notes the customer can hand over, in cents.
  const DENOMINATIONS = [50, 100, 200, 500, 1000, 2000, 5000];

  // Compact note-style label, e.g. 50c, €5, €20.
  function denomLabel(cents: number): string {
    return cents % 100 === 0 ? `€${cents / 100}` : `${cents}c`;
  }

  function addCash(delta: number) {
    const next = receivedCents + delta;
    if (next < 0 || next > MAX_CENTS) return;
    receivedCents = next;
  }
  function exact() {
    receivedCents = totalCents;
  }
  function pushDigit(d: number) {
    const next = receivedCents * 10 + d;
    if (next <= MAX_CENTS) receivedCents = next;
  }
  function pushDoubleZero() {
    pushDigit(0);
    pushDigit(0);
  }
  function backspace() {
    receivedCents = Math.floor(receivedCents / 10);
  }
  function resetReceived() {
    receivedCents = 0;
  }
  function openCash() {
    resetReceived();
    state = 'cash';
  }

  async function selectCard() {
    state = 'waiting';
    try {
      const result = await window.api.startPayment(totalCents);
      if (!result.ok) {
        errorMessage = result.error ?? 'Errore terminale';
        state = 'error';
        return;
      }
      if (result.approved) {
        authCode = result.authCode ?? '';
        state = 'approved';
        // Auto-proceed after a moment so cashier sees the approved screen
        setTimeout(() => onCardApproved(authCode), 1500);
      } else {
        errorMessage = `Rifiutato (codice ${result.responseCode})`;
        state = 'declined';
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Errore';
      state = 'error';
    }
  }

  async function cancelCard() {
    await window.api.cancelPayment();
    state = 'choose';
  }

  function retry() {
    state = 'choose';
    errorMessage = '';
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Modalità di pagamento"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
>
  <div class="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden max-h-[90vh] {state === 'cash' ? 'max-w-2xl' : 'max-w-sm'}">

    <!-- Amount header -->
    <div class="bg-green-900 text-white px-6 py-4 text-center shrink-0">
      <p class="text-sm uppercase tracking-wider opacity-70 mb-1">Totale da pagare</p>
      <p class="text-4xl font-bold">{formatEUR(total)}</p>
    </div>

    <!-- Body -->
    <div class="px-6 py-5 flex flex-col gap-3 overflow-y-auto">

      {#if state === 'choose'}
        <p class="text-center text-sm text-gray-500 font-medium">Come paga il cliente?</p>
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            onclick={openCash}
            class="flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-gray-200 hover:border-green-700 hover:bg-green-50 transition-colors"
          >
            <span class="text-3xl">💵</span>
            <span class="font-bold text-gray-800">Contanti</span>
          </button>
          <button
            type="button"
            onclick={selectCard}
            class="flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-gray-200 hover:border-blue-600 hover:bg-blue-50 transition-colors"
          >
            <span class="text-3xl">💳</span>
            <span class="font-bold text-gray-800">Carta</span>
          </button>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="text-center text-sm text-gray-400 hover:text-gray-600 pt-1"
        >
          Annulla
        </button>

      {:else if state === 'cash'}
        <!-- Two columns: amounts on the left, keypad on the right -->
        <div class="grid grid-cols-2 gap-5">

          <!-- Left: received amount, denominations, resto -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-medium text-gray-500">Contanti ricevuti</span>
              <div class="flex items-center gap-2">
                <span class="text-2xl font-bold tabular-nums text-gray-800">{formatEUR(receivedCents / 100)}</span>
                <button
                  type="button"
                  onclick={backspace}
                  disabled={receivedCents === 0}
                  aria-label="Cancella ultima cifra"
                  class="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                >⌫</button>
              </div>
            </div>

            <!-- Denomination buttons (tap to add what the customer hands over) -->
            <div class="grid grid-cols-4 gap-2">
              {#each DENOMINATIONS as cents (cents)}
                <button
                  type="button"
                  onclick={() => addCash(cents)}
                  class="py-2.5 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:border-green-700 hover:bg-green-50 transition-colors"
                >
                  {denomLabel(cents)}
                </button>
              {/each}
              <button
                type="button"
                onclick={exact}
                class="py-2.5 rounded-lg border-2 border-green-700 text-sm font-bold text-green-800 hover:bg-green-50 transition-colors"
              >
                Esatto
              </button>
            </div>

            <!-- Change readout -->
            {#if receivedCents === 0}
              <div class="rounded-xl bg-gray-50 px-4 py-2.5 text-center text-sm text-gray-400 mt-auto">
                Tocca gli importi ricevuti dal cliente
              </div>
            {:else if enough}
              <div class="rounded-xl bg-green-50 px-4 py-3 flex items-center justify-between mt-auto">
                <span class="text-sm font-semibold uppercase tracking-wider text-green-700">Resto</span>
                <span class="text-4xl font-bold tabular-nums text-green-800">{formatEUR(changeCents / 100)}</span>
              </div>
            {:else}
              <div class="rounded-xl bg-amber-50 px-4 py-3 flex items-center justify-between mt-auto">
                <span class="text-sm font-semibold uppercase tracking-wider text-amber-700">Mancano</span>
                <span class="text-3xl font-bold tabular-nums text-amber-800">{formatEUR(-changeCents / 100)}</span>
              </div>
            {/if}
          </div>

          <!-- Right: keypad -->
          <div class="grid grid-cols-3 grid-rows-4 gap-2">
            {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as d (d)}
              <button
                type="button"
                onclick={() => pushDigit(d)}
                class="rounded-lg border border-gray-200 text-xl font-semibold text-gray-800 hover:bg-gray-50"
              >{d}</button>
            {/each}
            <button
              type="button"
              onclick={pushDoubleZero}
              class="rounded-lg border border-gray-200 text-xl font-semibold text-gray-800 hover:bg-gray-50"
            >00</button>
            <button
              type="button"
              onclick={() => pushDigit(0)}
              class="rounded-lg border border-gray-200 text-xl font-semibold text-gray-800 hover:bg-gray-50"
            >0</button>
            <button
              type="button"
              onclick={resetReceived}
              aria-label="Azzera importo"
              class="rounded-lg border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50"
            >C</button>
          </div>

        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-1">
          <button
            type="button"
            onclick={() => (state = 'choose')}
            class="px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >← Indietro</button>
          <button
            type="button"
            onclick={onCash}
            class="flex-1 px-4 py-3 rounded-xl bg-green-700 text-white font-bold hover:bg-green-800"
          >Completa ordine</button>
        </div>

      {:else if state === 'waiting'}
        <div class="flex flex-col items-center gap-4 py-4">
          <div class="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
          <p class="font-semibold text-gray-800">In attesa del terminale…</p>
          <p class="text-sm text-gray-500 text-center">Il cliente inserisca la carta e segua le istruzioni sul terminale.</p>
          <button
            type="button"
            onclick={cancelCard}
            class="mt-2 px-5 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Annulla transazione
          </button>
        </div>

      {:else if state === 'approved'}
        <div class="flex flex-col items-center gap-3 py-4">
          <div class="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
            <span class="text-3xl">✓</span>
          </div>
          <p class="font-bold text-green-800 text-lg">Pagamento approvato</p>
          {#if authCode}
            <p class="text-xs text-gray-400">Auth: {authCode}</p>
          {/if}
          <p class="text-sm text-gray-500">Completamento ordine in corso…</p>
        </div>

      {:else if state === 'declined'}
        <div class="flex flex-col items-center gap-3 py-4">
          <div class="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
            <span class="text-3xl">✗</span>
          </div>
          <p class="font-bold text-red-700 text-lg">Pagamento rifiutato</p>
          <p class="text-sm text-gray-500">{errorMessage}</p>
          <div class="flex gap-3 pt-2">
            <button type="button" onclick={retry}
              class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">
              Riprova con carta
            </button>
            <button type="button" onclick={openCash}
              class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Paga in contanti
            </button>
          </div>
          <button type="button" onclick={onClose}
            class="text-sm text-gray-400 hover:text-gray-600">Annulla ordine</button>
        </div>

      {:else if state === 'error'}
        <div class="flex flex-col items-center gap-3 py-4">
          <div class="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
            <span class="text-3xl">⚠</span>
          </div>
          <p class="font-bold text-amber-700">Terminale non raggiungibile</p>
          <p class="text-sm text-gray-500 text-center">{errorMessage}</p>
          <div class="flex gap-3 pt-2">
            <button type="button" onclick={retry}
              class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Riprova
            </button>
            <button type="button" onclick={openCash}
              class="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-bold hover:bg-green-800">
              Paga in contanti
            </button>
          </div>
          <button type="button" onclick={onClose}
            class="text-sm text-gray-400 hover:text-gray-600">Annulla ordine</button>
        </div>
      {/if}

    </div>
  </div>
</div>
