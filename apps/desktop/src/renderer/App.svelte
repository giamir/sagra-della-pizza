<script lang="ts">
  import Cassa from './routes/cassa/Cassa.svelte'
  import VersionBanner from '$lib/components/VersionBanner.svelte'
</script>

<main class="flex h-screen flex-col bg-gray-50 text-gray-900">
  <VersionBanner />
  <div class="min-h-0 flex-1">
    <Cassa />
  </div>
</main>
