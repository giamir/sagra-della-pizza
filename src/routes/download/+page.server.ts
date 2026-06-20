import { list } from '@vercel/blob';

type UpdateFile = {
  url: string;
  size: number | null;
};

type UpdateInfo = {
  version: string | null;
  files: UpdateFile[];
};

type PreviousVersion = {
  version: string;
  windows: { href: string; size: number } | null;
  mac: { href: string; size: number } | null;
};

async function loadUpdateInfo(fileName: string, fetchFn: typeof fetch): Promise<UpdateInfo> {
  let response = await fetchFn(`/desktop-updates/${fileName}`);
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (location) response = await fetchFn(location);
  }

  if (!response.ok) return { version: null, files: [] };

  const text = await response.text();
  const version = text.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const files = Array.from(text.matchAll(/^\s*-\s+url:\s*(.+)$\n\s+sha512:.*\n\s+size:\s*(\d+)/gm))
    .map((match) => ({
      url: match[1].trim(),
      size: Number(match[2]) || null
    }));

  return { version, files };
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const diff = (bParts[i] ?? 0) - (aParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function fileNameFromPath(pathname: string): string {
  return pathname.split('/').pop() ?? pathname;
}

function normalizedName(fileName: string): string {
  return fileName.replaceAll(' ', '-');
}

async function loadPreviousVersions(currentVersion: string | null): Promise<PreviousVersion[]> {
  try {
    const byVersion = new Map<string, PreviousVersion>();
    let cursor: string | undefined;

    do {
      const result = await list({ prefix: 'desktop-updates/', cursor, limit: 1000 });
      cursor = result.cursor;

      for (const blob of result.blobs) {
        const fileName = fileNameFromPath(blob.pathname);
        const normalized = normalizedName(fileName);
        const version =
          normalized.match(/^Sagra-della-Pizza-Setup-(\d+\.\d+\.\d+)\.exe$/)?.[1] ??
          normalized.match(/^Sagra-della-Pizza-(\d+\.\d+\.\d+)-[^/]+\.dmg$/)?.[1] ??
          null;

        if (!version || version === currentVersion) continue;

        const entry = byVersion.get(version) ?? { version, windows: null, mac: null };
        if (normalized.endsWith('.exe') && !entry.windows) {
          entry.windows = { href: `/desktop-updates/${normalized}`, size: blob.size };
        }
        if (normalized.endsWith('.dmg') && !entry.mac) {
          entry.mac = { href: `/desktop-updates/${normalized}`, size: blob.size };
        }
        byVersion.set(version, entry);
      }
    } while (cursor);

    return Array.from(byVersion.values())
      .filter((entry) => entry.windows || entry.mac)
      .sort((a, b) => compareVersions(a.version, b.version))
      .slice(0, 8);
  } catch {
    return [];
  }
}

export const load = async ({ fetch }) => {
  const [windows, mac] = await Promise.all([
    loadUpdateInfo('latest.yml', fetch),
    loadUpdateInfo('latest-mac.yml', fetch)
  ]);

  const windowsInstaller = windows.files.find((file) => file.url.endsWith('.exe')) ?? null;
  const macDmg = mac.files.find((file) => file.url.endsWith('.dmg')) ?? null;

  const latestVersion = windows.version ?? mac.version;

  return {
    windows: {
      version: windows.version,
      href: windowsInstaller ? `/desktop-updates/${windowsInstaller.url}` : null,
      size: windowsInstaller?.size ?? null
    },
    mac: {
      version: mac.version,
      href: macDmg ? `/desktop-updates/${macDmg.url}` : null,
      size: macDmg?.size ?? null
    },
    previousVersions: await loadPreviousVersions(latestVersion)
  };
};
