<script lang="ts">
  import CategoryPage from '$lib/components/CategoryPage.svelte';
  import { MENU } from '$lib/stores/order.svelte';
  const category = MENU.categories.find((c) => c.id === 'griglia')!;
</script>

<CategoryPage {category} subtitle="Dalla brace, calda e fumante" />
