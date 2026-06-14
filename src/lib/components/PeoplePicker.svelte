<script lang="ts">
  import { order, setPeople } from '$lib/stores/order.svelte';
</script>

<div class="flex flex-col items-center gap-6 py-6">
  <label for="people-count" class="text-2xl font-semibold text-leaf">Quanti siete?</label>
  <div class="flex items-center gap-4" role="group" aria-label="Numero di persone">
    <button
      type="button"
      onclick={() => setPeople(order.people - 1)}
      disabled={order.people <= 1}
      aria-label="Una persona in meno"
      class="w-20 h-20 rounded-full bg-cream-100 hover:bg-cream-200 disabled:opacity-50 border-2 border-leaf text-leaf text-4xl font-bold flex items-center justify-center"
    >
      −
    </button>
    <div
      id="people-count"
      class="w-24 text-center text-6xl font-bold tabular-nums text-ink"
      aria-live="polite"
      aria-atomic="true"
    >
      {order.people}
    </div>
    <button
      type="button"
      onclick={() => setPeople(order.people + 1)}
      disabled={order.people >= 20}
      aria-label="Una persona in più"
      class="w-20 h-20 rounded-full bg-tomato hover:bg-tomato-dark disabled:opacity-50 text-white text-4xl font-bold flex items-center justify-center"
    >
      +
    </button>
  </div>
  <p class="text-base text-ink text-center max-w-md px-4">
    Aggiungeremo <strong>€ 1,50</strong> di coperto per persona.
  </p>
</div>
