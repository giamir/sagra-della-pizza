<script lang="ts">
  type Props = { title: string; subtitle?: string };
  let { title, subtitle }: Props = $props();
</script>

<header class="px-4 pt-4 pb-3 text-center">
  <h1 class="text-3xl sm:text-4xl font-bold text-leaf leading-tight">{title}</h1>
  {#if subtitle}
    <p class="mt-1 text-base text-ink">{subtitle}</p>
  {/if}
</header>
