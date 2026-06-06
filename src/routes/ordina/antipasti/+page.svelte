<script lang="ts">
  import CategoryPage from '$lib/components/CategoryPage.svelte';
  import { MENU } from '$lib/stores/order.svelte';
  const category = MENU.categories.find((c) => c.id === 'antipasti')!;
</script>

<CategoryPage {category} subtitle="Inizia con qualcosa di sfizioso" />
