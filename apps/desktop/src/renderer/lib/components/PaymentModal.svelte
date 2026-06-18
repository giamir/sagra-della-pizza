<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';

  type PaymentState = 'choose' | 'waiting' | 'approved' | 'declined' | 'error';

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
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">

    <!-- Amount header -->
    <div class="bg-green-900 text-white px-6 py-5 text-center">
      <p class="text-sm uppercase tracking-wider opacity-70 mb-1">Totale da pagare</p>
      <p class="text-4xl font-bold">{formatEUR(total)}</p>
    </div>

    <!-- Body -->
    <div class="px-6 py-6 flex flex-col gap-4">

      {#if state === 'choose'}
        <p class="text-center text-sm text-gray-500 font-medium">Come paga il cliente?</p>
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            onclick={onCash}
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
            <button type="button" onclick={onCash}
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
            <button type="button" onclick={onCash}
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
