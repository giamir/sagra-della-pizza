import Database from 'better-sqlite3';
import { join } from 'path';
import { app } from 'electron';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = join(app.getPath('userData'), 'gestionale.db');
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database): void {
  // Initial schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      till_name   TEXT NOT NULL DEFAULT 'default',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      people      INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      status      TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('open','paid','voided')),
      source      TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('qr','manual'))
    );

    CREATE TABLE IF NOT EXISTS order_lines (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_id          TEXT NOT NULL,
      qty              INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL DEFAULT 0,
      name_snapshot    TEXT NOT NULL DEFAULT '',
      station          TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tills (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS stock (
      item_id     TEXT PRIMARY KEY,
      initial_qty INTEGER NOT NULL,
      remaining_qty INTEGER NOT NULL
    );
  `);

  // Versioned migrations using SQLite user_version pragma
  const version = db.pragma('user_version', { simple: true }) as number;

  if (version < 1) {
    try { db.exec(`ALTER TABLE order_lines ADD COLUMN station TEXT NOT NULL DEFAULT ''`); } catch { /* already exists */ }
    db.pragma('user_version = 1');
  }

  if (version < 2) {
    try { db.exec(`ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'`); } catch { /* already exists */ }
    db.pragma('user_version = 2');
  }
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}
