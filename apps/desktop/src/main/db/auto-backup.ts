import { app } from 'electron';
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { getDb } from './schema.js';

// Automatic raw-DB snapshots — the rollback safety net. These are full copies
// of gestionale.db taken at safe points (app startup, and right before an
// update installs). Only the host holds live data, so callers gate on role.

const BACKUP_DIR_NAME = 'backups';

export function backupsDir(): string {
  const dir = join(app.getPath('userData'), BACKUP_DIR_NAME);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Reason becomes part of the filename so the operator can tell a routine
// startup copy from the authoritative pre-update snapshot.
function safeReason(reason: string): string {
  return reason.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'snapshot';
}

/**
 * Take a complete, consistent copy of the live database.
 *
 * The DB runs in WAL mode, so a bare file copy can miss transactions still in
 * the -wal file. We checkpoint (TRUNCATE) first to fold the WAL back into the
 * main file, then copy that single file — yielding a self-contained snapshot.
 *
 * Never throws: a failed backup must not block startup or an update.
 * Returns the snapshot path, or null on failure.
 */
export function snapshotDb(reason: string): string | null {
  try {
    const db = getDb();
    db.pragma('wal_checkpoint(TRUNCATE)');

    const srcPath = join(app.getPath('userData'), 'gestionale.db');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = join(
      backupsDir(),
      `gestionale-${app.getVersion()}-${stamp}-${safeReason(reason)}.db`
    );

    copyFileSync(srcPath, dest);
    return dest;
  } catch (err) {
    console.error('[auto-backup] snapshot failed:', err);
    return null;
  }
}

/**
 * Keep only the newest `keep` snapshots so the folder can't grow unbounded.
 * Sorted by file mtime (newest first) so pruning is correct regardless of how
 * version strings sort lexically.
 */
export function pruneSnapshots(keep = 15): void {
  try {
    const dir = backupsDir();
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('gestionale-') && f.endsWith('.db'))
      .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { f } of files.slice(keep)) {
      rmSync(join(dir, f), { force: true });
    }
  } catch (err) {
    console.error('[auto-backup] prune failed:', err);
  }
}
