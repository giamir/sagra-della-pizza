<script lang="ts">
  import CategoryPage from '$lib/components/CategoryPage.svelte';
  import { MENU } from '$lib/stores/order.svelte';

  let { data } = $props();
  const category = $derived(MENU.categories.find((c) => c.id === data.categoryId)!);
</script>

<CategoryPage {category} subtitle={category.subtitle} />
