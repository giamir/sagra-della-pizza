<script lang="ts">
  import { tenant } from '$lib/config/tenant';

  const setupSteps = [
    {
      title: '1. Preparare le casse',
      items: [
        'Usare un PC Windows per ogni cassa.',
        'Collegare la stampante termica al PC e fare una stampa di prova da Windows.',
        'Se si vuole leggere il QR dei clienti, collegare una webcam o una pistola scanner 2D.',
        'Se si usa il POS Nexi collegato alla cassa, tenere a portata il modello e le impostazioni del terminale.',
        'Se si usano più casse, o se il POS Nexi deve comunicare con il gestionale, preparare una rete locale.'
      ]
    },
    {
      title: '2. Preparare la rete locale',
      items: [
        'Per la funzione multicasse i PC devono essere collegati alla stessa rete locale.',
        'La rete locale può essere creata anche con un semplice router dedicato alla festa.',
        'Il router non deve per forza avere internet: serve soprattutto a far comunicare tra loro casse, stampanti e POS.',
        'Quando possibile, collegare le casse principali con cavo di rete: è più stabile del Wi-Fi.',
        'Verificare che il POS Nexi, se collegato al gestionale, sia sulla stessa rete della cassa.'
      ]
    },
    {
      title: '3. Installare il gestionale',
      items: [
        'Aprire sorsi.orentano.news/download dal PC della cassa.',
        'Scaricare l’installer Windows.',
        'Aprire il file scaricato e completare l’installazione.',
        'Avviare l’app "Sorsi e Morsi" dal desktop o dal menu Start.'
      ]
    },
    {
      title: '4. Configurare il menu',
      items: [
        'Aprire la sezione di gestione del catalogo nell’app cassa.',
        'Inserire categorie, prodotti, prezzi e varianti.',
        'Controllare bene i prezzi prima di iniziare a vendere.',
        'Fare un ordine di prova con pochi prodotti per verificare che il totale sia corretto.'
      ]
    },
    {
      title: '5. Configurare le postazioni',
      items: [
        'Decidere quali postazioni devono ricevere le comande, per esempio Bar e Cucina.',
        'Associare ogni categoria alla postazione corretta.',
        'Configurare la stampante della postazione se si stampano comande separate.',
        'Fare una stampa di prova per ogni postazione.'
      ]
    },
    {
      title: '6. Provare QR e pagamento',
      items: [
        'Da telefono aprire sorsi.orentano.news e preparare un ordine di prova.',
        'Mostrare il QR alla cassa.',
        'Scansionare il QR con webcam o pistola scanner 2D.',
        'Controllare che l’ordine caricato in cassa sia uguale a quello preparato dal cliente.',
        'Se si usa Nexi collegato al gestionale, fare una prova di pagamento con importo basso.'
      ]
    }
  ];
</script>

<div class="flex-1 px-6 py-10">
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-8">
    <a href="/download" class="self-start text-sm font-bold text-leaf underline underline-offset-4">
      Torna al download
    </a>

    <section class="text-center">
      <img
        src={tenant.brand.logo}
        alt=""
        width="160"
        height="160"
        class="mx-auto mb-5 h-auto w-24 rounded-full mix-blend-multiply"
      />
      <h1 class="text-4xl font-bold leading-tight text-leaf sm:text-5xl">Manuale rapido cassa</h1>
      <p class="mt-4 text-lg text-ink">
        Guida semplice per preparare le casse di {tenant.brand.name} senza conoscenze tecniche.
      </p>
    </section>

    <section class="rounded-lg border-2 border-leaf/15 bg-white/70 p-5 shadow-sm">
      <h2 class="text-2xl font-bold text-ink">Prima di iniziare</h2>
      <p class="mt-3 text-ink/80">
        Serve almeno una cassa funzionante con Windows, stampante termica già installata e una
        connessione internet per scaricare l’app. Per leggere gli ordini preparati dai clienti dal
        sito serve anche una webcam o una pistola scanner 2D. Per usare più casse, oppure un POS
        Nexi collegato al gestionale, serve anche una rete locale: può bastare un semplice router.
      </p>
    </section>

    <div class="grid gap-5">
      {#each setupSteps as step}
        <section class="rounded-lg border border-leaf/15 bg-cream-100/70 p-5">
          <h2 class="text-2xl font-bold text-ink">{step.title}</h2>
          <ul class="mt-4 list-disc space-y-2 pl-6 text-ink/85">
            {#each step.items as item}
              <li>{item}</li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>

    <section class="rounded-lg border-2 border-tomato/20 bg-white/80 p-5 shadow-sm">
      <h2 class="text-2xl font-bold text-ink">Informazioni utili da preparare</h2>
      <p class="mt-3 text-ink/80">
        Prima della configurazione è utile avere questo elenco pronto:
      </p>
      <ul class="mt-4 list-disc space-y-2 pl-6 text-ink/85">
        <li>Numero di casse da usare.</li>
        <li>Numero e nome delle postazioni, per esempio Bar, Cucina, Griglia o Dolci.</li>
        <li>Menu completo con prezzi, categorie e varianti.</li>
        <li>Modello delle stampanti termiche.</li>
        <li>Modello del POS Nexi, se deve essere collegato alla cassa.</li>
        <li>Come saranno collegati i PC: stessa rete Wi-Fi, cavo di rete o router dedicato.</li>
      </ul>
    </section>

    <section class="rounded-lg border border-leaf/15 bg-cream-100/70 p-5">
      <h2 class="text-2xl font-bold text-ink">Controllo finale</h2>
      <ol class="mt-4 list-decimal space-y-2 pl-6 text-ink/85">
        <li>Fare un ordine dal sito con il telefono.</li>
        <li>Leggere il QR dalla cassa.</li>
        <li>Stampare la ricevuta cliente.</li>
        <li>Stampare la comanda nelle postazioni corrette.</li>
        <li>Provare un pagamento.</li>
        <li>Annullare l’ordine di prova o segnarsi che è solo un test.</li>
      </ol>
    </section>
  </div>
</div>
