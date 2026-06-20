<script lang="ts">
  let { data } = $props();

  function formatSize(bytes: number | null): string {
    if (!bytes) return '';
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  }
</script>

<div class="flex-1 px-6 py-10">
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-8">
    <a href="/" class="self-start text-sm font-bold text-leaf underline underline-offset-4">
      Torna al sito
    </a>

    <section class="text-center">
      <img
        src="/ente-carnevale-dei-bambini.png"
        alt=""
        width="160"
        height="160"
        class="mx-auto mb-5 h-auto w-24 rounded-full mix-blend-multiply"
      />
      <h1 class="text-4xl font-bold leading-tight text-leaf sm:text-5xl">Gestionale cassa</h1>
      <p class="mt-4 text-lg text-ink">
        Scarica l'ultima versione dell'app desktop per le casse della Sagra della Pizza.
      </p>
    </section>

    <div class="grid gap-4 md:grid-cols-2">
      <section class="rounded-lg border-2 border-leaf/15 bg-white/70 p-5 shadow-sm">
        <p class="text-sm font-bold uppercase tracking-wide text-tomato">Windows</p>
        <h2 class="mt-1 text-2xl font-bold text-ink">Installer</h2>
        <p class="mt-2 text-sm text-ink/70">
          Versione {data.windows.version ?? 'non disponibile'}
          {#if data.windows.size}
            · {formatSize(data.windows.size)}
          {/if}
        </p>
        {#if data.windows.href}
          <a
            href={data.windows.href}
            class="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-full bg-tomato px-6 py-3 text-center text-lg font-bold text-white shadow-lg hover:bg-tomato-dark"
          >
            Scarica per Windows
          </a>
        {:else}
          <p class="mt-5 rounded-lg bg-cream-100 px-4 py-3 text-sm font-semibold text-ink">
            Installer Windows non disponibile.
          </p>
        {/if}
      </section>

      <section class="rounded-lg border-2 border-leaf/15 bg-white/70 p-5 shadow-sm">
        <p class="text-sm font-bold uppercase tracking-wide text-tomato">macOS</p>
        <h2 class="mt-1 text-2xl font-bold text-ink">DMG</h2>
        <p class="mt-2 text-sm text-ink/70">
          Versione {data.mac.version ?? 'non disponibile'}
          {#if data.mac.size}
            · {formatSize(data.mac.size)}
          {/if}
        </p>
        {#if data.mac.href}
          <a
            href={data.mac.href}
            class="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-full bg-leaf px-6 py-3 text-center text-lg font-bold text-white shadow-lg hover:bg-leaf-dark"
          >
            Scarica per macOS
          </a>
        {:else}
          <p class="mt-5 rounded-lg bg-cream-100 px-4 py-3 text-sm font-semibold text-ink">
            DMG macOS non disponibile.
          </p>
        {/if}
      </section>
    </div>

    <p class="text-center text-sm text-ink/70">
      L'app installata controlla automaticamente gli aggiornamenti. Su macOS potrebbe essere necessario aprire il DMG con clic destro se l'app non e' firmata.
    </p>
  </div>
</div>
