<script lang="ts">
  import CategoryPage from '$lib/components/CategoryPage.svelte';
  import { MENU } from '$lib/stores/order.svelte';
  const category = MENU.categories.find((c) => c.id === 'bar')!;
</script>

<CategoryPage {category} subtitle="Caffè, spumante e dolci" />
