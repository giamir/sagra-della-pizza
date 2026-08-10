<script lang="ts">
  import { formatEUR } from '@sagra/shared/utils/currency';
  import { Delete } from 'lucide-svelte';

  // When opened from a cart line, `line` pre-fills a discount for that item:
  // amount = one unit's price, reason = "Sconto <name>", presets = unit
  // multiples up to the line's qty (so "2 bignè gratis" is one tap).
  let {
    line = null,
    onAdd,
    onClose
  }: {
    line?: { name: string; unitCents: number; qty: number } | null;
    onAdd: (amountCents: number, reason?: string) => void;
    onClose: () => void;
  } = $props();

  // The modal is remounted on every open, so reading `line` once at init is
  // intended — it seeds the editable fields.
  // svelte-ignore state_referenced_locally
  const seed = line;

  // sign: -1 = sconto (discount), +1 = supplemento (surplus). Default supplemento.
  let sign = $state<-1 | 1>(seed ? -1 : 1);
  let amountCents = $state(seed ? seed.unitCents : 0);
  let reason = $state(seed ? `Sconto ${seed.name}`.slice(0, 24) : '');

  const REASON_MAX = 24;
  const MAX_CENTS = 99999; // €999,99 — ad-hoc adjustments never need more

  // Quick presets as magnitudes (cents); the active sign decides + or −.
  const PRESET_CENTS = [50, 100, 200];

  const unitMultiples = $derived(
    seed ? Array.from({ length: Math.min(seed.qty, 4) }, (_, i) => i + 1) : []
  );

  const signedCents = $derived(sign * amountCents);
  const valid = $derived(amountCents > 0);

  // Digit-push in cents, like the contanti keypad: "3" "5" "0" → €3,50.
  function pushDigit(d: number) {
    const next = amountCents * 10 + d;
    if (next <= MAX_CENTS) amountCents = next;
  }
  function pushDoubleZero() {
    pushDigit(0);
    pushDigit(0);
  }
  function backspace() {
    amountCents = Math.floor(amountCents / 10);
  }
  function clearAmount() {
    amountCents = 0;
  }

  // Tap to accumulate, like the contanti denomination pad: each tap adds its
  // magnitude to the current importo (so +€0,50 twice = €1,00).
  function applyPreset(magnitude: number) {
    const next = amountCents + magnitude;
    if (next <= MAX_CENTS) amountCents = next;
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
  <div class="bg-white dark:bg-[#20242c] rounded-2xl shadow-2xl p-6 w-[40rem] max-w-[92vw]">

    <!-- Header: title + amount readout on one line -->
    <div class="flex items-center justify-between gap-3 mb-4">
      <h2 class="text-lg font-bold text-gray-900 truncate">
        {seed ? `Sconto — ${seed.name}` : 'Sconto / Supplemento'}
      </h2>
      <div class="flex items-center gap-2 shrink-0">
        <span
          class="text-2xl font-bold tabular-nums"
          class:text-red-700={sign === -1 && valid}
          class:text-green-800={sign === 1 && valid}
          class:text-gray-300={!valid}
        >{sign === -1 ? '−' : '+'}{formatEUR(amountCents / 100)}</span>
        <button
          type="button"
          onclick={backspace}
          disabled={amountCents === 0}
          aria-label="Cancella ultima cifra"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
        ><Delete size={16} /></button>
      </div>
    </div>

    <!-- Left column gets the extra width: its labels (Supplemento, Aggiungi €…)
         are wider than the keypad digits need. -->
    <div class="grid grid-cols-[1.25fr_1fr] gap-5">

      <!-- Left: sign, presets, reason, actions -->
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-2">
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

        <div class="flex flex-wrap gap-2 content-start">
          {#if seed}
            <!-- Unit multiples: set (not accumulate) so "2×" always means 2 units. -->
            {#each unitMultiples as n (n)}
              <button
                type="button"
                onclick={() => amountCents = n * seed.unitCents}
                class="px-3 py-1.5 rounded-full border text-sm font-bold hover:bg-gray-50 transition-colors"
                class:border-red-600={amountCents === n * seed.unitCents}
                class:bg-red-50={amountCents === n * seed.unitCents}
                class:text-red-700={amountCents === n * seed.unitCents}
                class:border-gray-200={amountCents !== n * seed.unitCents}
                class:text-gray-700={amountCents !== n * seed.unitCents}
              >
                {n}× {formatEUR((n * seed.unitCents) / 100)}
              </button>
            {/each}
          {:else}
            {#each PRESET_CENTS as m (m)}
              <button
                type="button"
                onclick={() => applyPreset(m)}
                class="px-3 py-1.5 rounded-full border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                {sign === -1 ? '−' : '+'}{formatEUR(m / 100)}
              </button>
            {/each}
          {/if}
        </div>

        <div class="mt-auto">
          <label class="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1" for="adj-reason">Motivo (facoltativo)</label>
          <input
            id="adj-reason"
            type="text"
            maxlength={REASON_MAX}
            bind:value={reason}
            placeholder={sign === -1 ? 'Sconto' : 'Supplemento'}
            class="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-green-700 outline-none text-sm"
          />
        </div>

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

      <!-- Right: keypad -->
      <div class="grid grid-cols-3 grid-rows-4 gap-2">
        {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as d (d)}
          <button
            type="button"
            onclick={() => pushDigit(d)}
            class="py-2.5 rounded-lg border border-gray-200 text-xl font-semibold text-gray-800 hover:bg-gray-50"
          >{d}</button>
        {/each}
        <button
          type="button"
          onclick={pushDoubleZero}
          class="py-2.5 rounded-lg border border-gray-200 text-xl font-semibold text-gray-800 hover:bg-gray-50"
        >00</button>
        <button
          type="button"
          onclick={() => pushDigit(0)}
          class="py-2.5 rounded-lg border border-gray-200 text-xl font-semibold text-gray-800 hover:bg-gray-50"
        >0</button>
        <button
          type="button"
          onclick={clearAmount}
          aria-label="Azzera importo"
          class="py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50"
        >C</button>
      </div>

    </div>
  </div>
</div>
