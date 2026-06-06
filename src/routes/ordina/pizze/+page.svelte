<script lang="ts">
  import CategoryPage from '$lib/components/CategoryPage.svelte';
  import { MENU } from '$lib/stores/order.svelte';
  const category = MENU.categories.find((c) => c.id === 'pizze')!;
</script>

<CategoryPage {category} subtitle="Le protagoniste della sagra" />
