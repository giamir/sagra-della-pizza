<script lang="ts">
  import { page } from '$app/state';

  const sections = [
    { href: '/ordina/persone', label: 'Persone' },
    { href: '/ordina/bevande', label: 'Bevande' },
    { href: '/ordina/antipasti', label: 'Antipasti' },
    { href: '/ordina/pizze', label: 'Pizze' },
    { href: '/ordina/griglia', label: 'Griglia' },
    { href: '/ordina/contorni', label: 'Contorni' },
    { href: '/ordina/bar', label: 'Bar' },
    { href: '/ordina/riepilogo', label: 'Riepilogo' }
  ];
</script>

<nav
  aria-label="Sezioni dell'ordine"
  class="bg-cream-100 border-b-2 border-cream-200 sticky top-0 z-10 section-nav"
>
  <ol class="section-nav-list flex gap-2 px-3 py-2 scroll-smooth">
    {#each sections as s, i (s.href)}
      {@const active = page.url.pathname === s.href}
      <li class="shrink-0">
        <a
          href={s.href}
          aria-current={active ? 'page' : undefined}
          class="inline-flex items-center gap-1 px-4 py-2 rounded-full text-base font-semibold border-2 min-h-12
            {active
              ? 'bg-leaf text-cream-50 border-leaf'
              : 'bg-cream-50 text-leaf border-leaf hover:bg-cream-200'}"
        >
          <span class="tabular-nums opacity-70">{i + 1}.</span>
          {s.label}
        </a>
      </li>
    {/each}
  </ol>
</nav>

<style>
  .section-nav {
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      black 1.25rem,
      black calc(100% - 1.25rem),
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0,
      black 1.25rem,
      black calc(100% - 1.25rem),
      transparent 100%
    );
  }
  .section-nav-list {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .section-nav-list::-webkit-scrollbar {
    display: none;
  }
</style>
