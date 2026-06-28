<script lang="ts">
  import { onMount } from 'svelte';
  import tenantJson from '@sagra/shared/config/tenant.json';

  const tenant = tenantJson as { desktop?: { productName?: string } };

  let { onClose }: { onClose: () => void } = $props();

  type AppInfo = {
    name: string;
    version: string;
    isPackaged: boolean;
  };

  type UpdateStatus = {
    state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    currentVersion: string;
    isPackaged: boolean;
    supportsAutoInstall: boolean;
    message: string;
    latestVersion?: string;
    lastCheckedAt?: string;
    percent?: number;
    error?: string;
  };

  let appInfo = $state<AppInfo | null>(null);
  let updateStatus = $state<UpdateStatus | null>(null);
  let checking = $state(false);
  let installing = $state(false);

  const statusTone = $derived.by(() => {
    if (!updateStatus) return 'text-gray-600 bg-gray-50 border-gray-200';
    if (updateStatus.state === 'downloaded') return 'text-green-800 bg-green-50 border-green-200';
    if (updateStatus.state === 'error') return 'text-red-700 bg-red-50 border-red-200';
    if (updateStatus.state === 'available' || updateStatus.state === 'downloading') {
      return 'text-blue-800 bg-blue-50 border-blue-200';
    }
    return 'text-gray-700 bg-gray-50 border-gray-200';
  });

  const canInstall = $derived(updateStatus?.supportsAutoInstall && updateStatus?.state === 'downloaded');
  const canOpenDownload = $derived(updateStatus && !updateStatus.supportsAutoInstall && updateStatus.state === 'available');
  const canCheck = $derived(!checking && updateStatus?.state !== 'checking' && updateStatus?.state !== 'downloading');

  function formatCheckedAt(value?: string): string {
    if (!value) return 'Mai';
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  onMount(() => {
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      const [info, status] = await Promise.all([
        window.api.getAppInfo(),
        window.api.getUpdateStatus()
      ]);
      appInfo = info as AppInfo;
      updateStatus = status as UpdateStatus;
      unsubscribe = window.api.onUpdateStatus((next) => {
        updateStatus = next as UpdateStatus;
        checking = false;
      });
    })();

    return () => unsubscribe?.();
  });

  async function checkNow() {
    checking = true;
    try {
      updateStatus = await window.api.checkForUpdates() as UpdateStatus;
    } finally {
      checking = false;
    }
  }

  async function installNow() {
    installing = true;
    try {
      await window.api.installUpdate();
    } finally {
      installing = false;
    }
  }

  function handleBackdrop(e: MouseEvent) {
    if ((e.target as Element) === (e.currentTarget as Element)) onClose();
  }
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Aggiornamenti"
  tabindex="-1"
  class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
  onclick={handleBackdrop}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="bg-white dark:bg-[#20242c] rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 flex flex-col gap-5">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="font-bold text-lg text-gray-900">Aggiornamenti</h2>
        <p class="text-sm font-semibold text-gray-500">{appInfo?.name ?? tenant.desktop?.productName ?? 'Gestionale'}</p>
      </div>
      <button type="button" onclick={onClose} class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-lg border border-gray-200 px-4 py-3">
        <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Versione installata</p>
        <p class="mt-1 text-2xl font-black tabular-nums text-gray-900">{appInfo?.version ?? updateStatus?.currentVersion ?? '...'}</p>
      </div>
      <div class="rounded-lg border border-gray-200 px-4 py-3">
        <p class="text-xs font-bold uppercase tracking-wider text-gray-400">Ultimo controllo</p>
        <p class="mt-1 text-sm font-bold text-gray-800">{formatCheckedAt(updateStatus?.lastCheckedAt)}</p>
      </div>
    </div>

    <div class={`rounded-lg border px-4 py-3 ${statusTone}`}>
      <p class="text-sm font-bold">{updateStatus?.message ?? 'Caricamento stato aggiornamenti...'}</p>
      {#if updateStatus?.latestVersion}
        <p class="mt-1 text-xs font-semibold">Ultima versione: {updateStatus.latestVersion}</p>
      {/if}
      {#if updateStatus?.state === 'downloading' && typeof updateStatus.percent === 'number'}
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/80 dark:bg-white/15">
          <div class="h-full rounded-full bg-blue-700" style={`width:${Math.max(0, Math.min(100, updateStatus.percent))}%`}></div>
        </div>
        <p class="mt-1 text-xs font-semibold">{updateStatus.percent}%</p>
      {/if}
      {#if updateStatus?.error}
        <p class="mt-2 text-xs font-semibold break-words">{updateStatus.error}</p>
      {/if}
    </div>

    {#if appInfo && !appInfo.isPackaged}
      <p class="text-xs font-semibold text-gray-500">
        Il controllo automatico funziona solo dopo aver installato un pacchetto distribuito dal feed pubblico.
      </p>
    {/if}

    <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
      <button
        type="button"
        onclick={() => window.api.openReleases()}
        class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        Apri download
      </button>
      <div class="flex gap-3">
        <button
          type="button"
          onclick={checkNow}
          disabled={!canCheck}
          class="px-4 py-2 rounded-lg border border-green-700 text-sm font-bold text-green-800 hover:bg-green-50 disabled:opacity-50"
        >
          {checking || updateStatus?.state === 'checking' ? 'Controllo...' : 'Controlla aggiornamenti'}
        </button>
        {#if canInstall}
          <button
            type="button"
            onclick={installNow}
            disabled={installing}
            class="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-bold hover:bg-green-800 disabled:opacity-50"
          >
            {installing ? 'Riavvio...' : 'Riavvia e installa'}
          </button>
        {/if}
        {#if canOpenDownload}
          <button
            type="button"
            onclick={() => window.api.openReleases()}
            class="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-bold hover:bg-green-800"
          >
            Scarica DMG
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
