<script lang="ts">
  import PeoplePicker from '$lib/components/PeoplePicker.svelte';
  import StepHeader from '$lib/components/StepHeader.svelte';
</script>

<StepHeader title="Il tuo tavolo" subtitle="Iniziamo: quanti siete a mangiare?" />

<div class="flex-1 flex items-center justify-center px-4 pb-6 max-w-2xl mx-auto w-full">
  <PeoplePicker />
</div>
