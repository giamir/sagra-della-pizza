<script lang="ts">
  import { onMount } from 'svelte';
  import { TriangleAlert } from 'lucide-svelte';

  // Shown on a client till when its app version differs from the host's, so the
  // operator realigns the fleet before mismatched client↔host calls misbehave.
  let info = $state<{ hostVersion: string; localVersion: string } | null>(null);

  onMount(() => {
    return window.api.onVersionMismatch((next) => {
      info = next.mismatch ? { hostVersion: next.hostVersion, localVersion: next.localVersion } : null;
    });
  });
</script>

{#if info}
  <div
    class="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950"
    role="alert"
  >
    <TriangleAlert size={18} class="shrink-0" />
    <span>
      Host aggiornato alla versione {info.hostVersion} — questa cassa è alla {info.localVersion}.
      Aggiorna questa postazione.
    </span>
  </div>
{/if}
