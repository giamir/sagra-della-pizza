import Database from 'better-sqlite3';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tenant } from './tenant.js';

const DB_FILE = 'gestionale.db';

// Electron names the userData folder after package.json's productName, which is
// hardcoded to "Sagra della Pizza" for every tenant build — so two tenants
// installed on one PC would share a single gestionale.db. Key the folder on the
// tenant's productName instead. Must run before anything touches userData.
export function isolateTenantUserData(): void {
  const legacyDir = app.getPath('userData');
  const tenantDir = join(app.getPath('appData'), tenant.desktop.productName);
  if (tenantDir === legacyDir) return; // Sagra della Pizza: nothing moves

  // First launch after the fix: carry over the orders/catalog/settings this
  // install has been writing to the shared folder. Copy, never move — another
  // tenant on the same PC may still own that file. VACUUM INTO takes a
  // consistent snapshot even if that other app has it open in WAL mode.
  const legacyDb = join(legacyDir, DB_FILE);
  const tenantDb = join(tenantDir, DB_FILE);
  if (!existsSync(tenantDb) && existsSync(legacyDb)) {
    try {
      mkdirSync(tenantDir, { recursive: true });
      const src = new Database(legacyDb, { readonly: true });
      src.prepare('VACUUM INTO ?').run(tenantDb);
      src.close();
    } catch (err) {
      console.error('Could not copy the legacy database:', err);
    }
  }

  app.setPath('userData', tenantDir);
}
