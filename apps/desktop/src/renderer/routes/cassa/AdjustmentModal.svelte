<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';

  let {
    onAdd,
    onClose
  }: {
    onAdd: (amountCents: number, reason?: string) => void;
    onClose: () => void;
  } = $props();

  // sign: -1 = sconto (discount), +1 = supplemento (surplus). Default supplemento.
  let sign = $state<-1 | 1>(1);
  let amount = $state(''); // euros, as typed
  let reason = $state('');

  const REASON_MAX = 24;

  // Quick presets as magnitudes (cents); the active sign decides + or −.
  const PRESET_CENTS = [50, 100, 200];

  const amountCents = $derived(Math.round((Number(amount.replace(',', '.')) || 0) * 100));
  const signedCents = $derived(sign * Math.abs(amountCents));
  const valid = $derived(Math.abs(amountCents) > 0);

  // Tap to accumulate, like the contanti denomination pad: each tap adds its
  // magnitude to the current importo (so +€0,50 twice = €1,00).
  function applyPreset(magnitude: number) {
    amount = ((amountCents + magnitude) / 100).toString();
  }

  function confirm() {
    if (!valid) return;
    onAdd(signedCents, reason.trim() || undefined);
  }
</script>

<!-- Backdrop -->
<div
  role="dialog"
  aria-modal="true"
  aria-label="Sconto o supplemento"
  tabindex="-1"
  class="absolute inset-0 z-30 bg-black/60 flex items-center justify-center"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="bg-white dark:bg-[#20242c] rounded-2xl shadow-2xl p-6 w-80 max-w-[90vw]">
    <h2 class="text-lg font-bold text-gray-900 mb-4">Sconto / Supplemento</h2>

    <!-- Sign toggle -->
    <div class="grid grid-cols-2 gap-2 mb-3">
      <button
        type="button"
        onclick={() => sign = -1}
        class="py-2 rounded-xl border-2 font-bold text-sm transition-colors"
        class:border-red-600={sign === -1}
        class:bg-red-50={sign === -1}
        class:text-red-700={sign === -1}
        class:border-gray-200={sign !== -1}
        class:text-gray-500={sign !== -1}
      >− Sconto</button>
      <button
        type="button"
        onclick={() => sign = 1}
        class="py-2 rounded-xl border-2 font-bold text-sm transition-colors"
        class:border-green-700={sign === 1}
        class:bg-green-50={sign === 1}
        class:text-green-800={sign === 1}
        class:border-gray-200={sign !== 1}
        class:text-gray-500={sign !== 1}
      >+ Supplemento</button>
    </div>

    <!-- Amount -->
    <label class="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1" for="adj-amount">Importo €</label>
    <input
      id="adj-amount"
      type="number"
      inputmode="decimal"
      min="0"
      step="0.50"
      bind:value={amount}
      placeholder="0,00"
      class="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-green-700 outline-none text-lg font-bold tabular-nums mb-2"
    />

    <!-- Presets -->
    <div class="flex flex-wrap gap-2 mb-3">
      {#each PRESET_CENTS as m (m)}
        <button
          type="button"
          onclick={() => applyPreset(m)}
          class="px-3 py-1.5 rounded-full border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          {sign === -1 ? '−' : '+'}{formatEUR(m / 100)}
        </button>
      {/each}
    </div>

    <!-- Reason (optional) -->
    <label class="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1" for="adj-reason">Motivo (facoltativo)</label>
    <input
      id="adj-reason"
      type="text"
      maxlength={REASON_MAX}
      bind:value={reason}
      placeholder={sign === -1 ? 'Sconto' : 'Supplemento'}
      class="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-green-700 outline-none text-sm mb-4"
    />

    <div class="flex gap-2">
      <button
        type="button"
        onclick={onClose}
        class="flex-1 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50"
      >
        Annulla
      </button>
      <button
        type="button"
        onclick={confirm}
        disabled={!valid}
        class="flex-1 py-2 rounded-xl bg-green-800 hover:bg-green-900 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm transition-colors"
      >
        Aggiungi {valid ? formatEUR(signedCents / 100) : ''}
      </button>
    </div>
  </div>
</div>
