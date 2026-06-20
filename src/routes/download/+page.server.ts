type UpdateFile = {
  url: string;
  size: number | null;
};

type UpdateInfo = {
  version: string | null;
  files: UpdateFile[];
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

export const load = async ({ fetch }) => {
  const [windows, mac] = await Promise.all([
    loadUpdateInfo('latest.yml', fetch),
    loadUpdateInfo('latest-mac.yml', fetch)
  ]);

  const windowsInstaller = windows.files.find((file) => file.url.endsWith('.exe')) ?? null;
  const macDmg = mac.files.find((file) => file.url.endsWith('.dmg')) ?? null;

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
    }
  };
};
