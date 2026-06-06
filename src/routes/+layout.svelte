<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<a href="#main" class="skip-link">Salta al contenuto</a>

<div class="min-h-dvh flex flex-col bg-cream-50">
  <main id="main" class="flex-1 flex flex-col">
    {@render children()}
  </main>
</div>
