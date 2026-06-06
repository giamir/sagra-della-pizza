<script lang="ts">
  import CategoryPage from '$lib/components/CategoryPage.svelte';
  import { MENU } from '$lib/stores/order.svelte';
  const category = MENU.categories.find((c) => c.id === 'contorni')!;
</script>

<CategoryPage {category} subtitle="Per accompagnare al meglio" />
