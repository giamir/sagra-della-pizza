// Delete old desktop-update releases from a tenant's Vercel Blob store, keeping
// the N most recent versions.
//
// Each release uploads ~24 objects (12 artifacts under two names — the original
// with spaces and a hyphenated copy, see upload-to-vercel-blob.mjs) totalling
// ~1.3 GB, and nothing ever removed them, so a store grew by that much per tag.
//
// Safe for updates: electron-updater diffs the *new* blockmap against the file
// already on the client's disk, so old releases are never fetched from the feed.
// The only user-visible effect is that the "versioni precedenti" list on
// /download shrinks to the releases kept here.
//
//   node tools/desktop-updates/prune-blob-versions.mjs            # dry run
//   node tools/desktop-updates/prune-blob-versions.mjs --apply    # delete
//   node tools/desktop-updates/prune-blob-versions.mjs --keep 5 --apply
//
// Reads BLOB_READ_WRITE_TOKEN from the environment (same as the uploader).
import { del, list } from '@vercel/blob';

const prefix = process.env.DESKTOP_UPDATE_BLOB_PREFIX ?? 'desktop-updates';

/** Semver-ish compare for the `1.2.3` strings embedded in artifact filenames. */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function versionOf(pathname) {
  return pathname.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
}

export async function pruneOldVersions({ token, keep = 3, dryRun = true, log = console.log } = {}) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ token, prefix: `${prefix}/`, limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);

  // The feed files carry no version in their name and must always survive.
  // Whatever version they point at is pinned too, so a client mid-update can
  // still fetch the installer its latest.yml advertises.
  const feeds = blobs.filter((b) => b.pathname.endsWith('.yml'));
  const pinned = new Set();
  for (const feed of feeds) {
    try {
      const text = await (await fetch(feed.url)).text();
      const v = text.match(/^version:\s*(\d+\.\d+\.\d+)/m)?.[1];
      if (v) pinned.add(v);
    } catch {
      // If a feed can't be read we cannot know what it pins, so prune nothing.
      throw new Error(`Could not read ${feed.pathname} — aborting rather than risk deleting a live release.`);
    }
  }

  const versions = [...new Set(blobs.map((b) => versionOf(b.pathname)).filter(Boolean))].sort(
    compareVersions
  );
  const kept = new Set([...versions.slice(-keep), ...pinned]);
  const doomed = blobs.filter((b) => {
    const v = versionOf(b.pathname);
    return v !== null && !kept.has(v);
  });

  const freed = doomed.reduce((s, b) => s + b.size, 0);
  const total = blobs.reduce((s, b) => s + b.size, 0);
  log(
    `${blobs.length} objects, ${(total / 1e9).toFixed(2)} GB | versions: ${versions.length}` +
      ` | keeping ${[...kept].sort(compareVersions).join(', ')}`
  );
  log(
    `${dryRun ? 'Would delete' : 'Deleting'} ${doomed.length} objects across ` +
      `${versions.length - kept.size} versions, freeing ${(freed / 1e9).toFixed(2)} GB`
  );

  if (!dryRun && doomed.length > 0) {
    // del() takes up to 1000 urls per call; chunk to stay well inside that.
    for (let i = 0; i < doomed.length; i += 100) {
      const chunk = doomed.slice(i, i + 100);
      await del(chunk.map((b) => b.url), { token });
      log(`  deleted ${Math.min(i + chunk.length, doomed.length)}/${doomed.length}`);
    }
  }

  return { deleted: dryRun ? 0 : doomed.length, freed, kept: [...kept] };
}

// CLI entrypoint (skipped when imported by the uploader).
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const keepIdx = args.indexOf('--keep');
  const keep = keepIdx === -1 ? 3 : Number(args[keepIdx + 1]);
  const dryRun = !args.includes('--apply');

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN is not set.');
    process.exit(1);
  }
  if (!Number.isInteger(keep) || keep < 1) {
    console.error('--keep must be a positive integer.');
    process.exit(1);
  }

  await pruneOldVersions({ token: process.env.BLOB_READ_WRITE_TOKEN, keep, dryRun });
  if (dryRun) console.log('\nDry run — re-run with --apply to delete.');
}
