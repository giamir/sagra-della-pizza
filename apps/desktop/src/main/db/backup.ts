import { app } from 'electron';
import { getDb, getSetting, setSetting } from './schema.js';

// Settings keys that travel with a backup. Deliberately excludes
// machine-specific config (printer_config, ecr17_config, till_settings) so an
// import never clobbers the target machine's hardware/network setup.
const EXPORTED_SETTING_KEYS = ['catalog_json', 'station_overrides', 'stations_list', 'coperto_station'] as const;

const BUNDLE_FORMAT = 'sagra-db';
const BUNDLE_VERSION = 1;

type OrderRow = {
  id: number;
  till_name: string;
  created_at: string;
  people: number;
  total_cents: number;
  status: string;
  source: string;
  payment_method: string;
};

type OrderLineRow = {
  id: number;
  order_id: number;
  item_id: string;
  qty: number;
  unit_price_cents: number;
  name_snapshot: string;
  station: string;
};

type StockRow = {
  item_id: string;
  initial_qty: number;
  remaining_qty: number;
};

type CashFloatRow = {
  till_name: string;
  business_date: string;
  fondo_cents: number;
  counted_cents: number | null;
  updated_at: string;
};

export interface DbBundle {
  format: string;
  version: number;
  dbUserVersion: number;
  exportedAt: string;
  app: string;
  orders: OrderRow[];
  order_lines: OrderLineRow[];
  stock: StockRow[];
  cash_floats: CashFloatRow[];
  settings: Record<string, string>;
}

export function buildBundle(): DbBundle {
  const db = getDb();

  const orders = db.prepare('SELECT * FROM orders').all() as OrderRow[];
  const order_lines = db.prepare('SELECT * FROM order_lines').all() as OrderLineRow[];
  const stock = db.prepare('SELECT * FROM stock').all() as StockRow[];
  const cash_floats = db.prepare('SELECT * FROM cash_floats').all() as CashFloatRow[];

  const settings: Record<string, string> = {};
  for (const key of EXPORTED_SETTING_KEYS) {
    const value = getSetting(key);
    if (value != null) settings[key] = value;
  }

  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    dbUserVersion: db.pragma('user_version', { simple: true }) as number,
    exportedAt: new Date().toISOString(),
    app: app.getVersion(),
    orders,
    order_lines,
    stock,
    cash_floats,
    settings
  };
}

function validateBundle(bundle: unknown): asserts bundle is DbBundle {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('File non valido: contenuto non riconosciuto.');
  }
  const b = bundle as Record<string, unknown>;
  if (b.format !== BUNDLE_FORMAT) {
    throw new Error('File non valido: non è un backup della Sagra.');
  }
  if (typeof b.version !== 'number' || b.version > BUNDLE_VERSION) {
    throw new Error('Backup creato da una versione più recente dell\'app. Aggiorna l\'app e riprova.');
  }
  for (const field of ['orders', 'order_lines', 'stock', 'cash_floats'] as const) {
    if (!Array.isArray(b[field])) {
      throw new Error(`File non valido: manca la sezione "${field}".`);
    }
  }
  if (b.settings == null || typeof b.settings !== 'object') {
    throw new Error('File non valido: manca la sezione "settings".');
  }
}

/**
 * Wipe all operational data from the live database, returning it to an
 * empty-event state: no orders, no stock counts, no cash floats.
 *
 * Mirrors the destructive scope of an import — it deliberately leaves the
 * catalog and every machine-specific setting (printer, payment, till, network)
 * untouched, so the postazione stays configured and ready for a fresh event.
 */
export function resetDatabase(): { orders: number } {
  const db = getDb();

  const before = db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number };

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec('DELETE FROM order_lines');
      db.exec('DELETE FROM orders');
      db.exec('DELETE FROM stock');
      db.exec('DELETE FROM cash_floats');
      // Restart AUTOINCREMENT counters so the next event numbers from 1 again.
      db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('orders', 'order_lines')`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  return { orders: before.n };
}

export function importBundle(bundle: unknown): { orders: number } {
  validateBundle(bundle);
  const db = getDb();

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec('DELETE FROM order_lines');
      db.exec('DELETE FROM orders');
      db.exec('DELETE FROM stock');
      db.exec('DELETE FROM cash_floats');
      // Restart AUTOINCREMENT counters so explicit ids load cleanly.
      db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('orders', 'order_lines')`);

      const insertOrder = db.prepare(`
        INSERT INTO orders (id, till_name, created_at, people, total_cents, status, source, payment_method)
        VALUES (@id, @till_name, @created_at, @people, @total_cents, @status, @source, @payment_method)
      `);
      for (const o of bundle.orders) {
        insertOrder.run({
          id: o.id,
          till_name: o.till_name ?? 'default',
          created_at: o.created_at,
          people: o.people,
          total_cents: o.total_cents,
          status: o.status ?? 'paid',
          source: o.source ?? 'manual',
          payment_method: o.payment_method ?? 'cash'
        });
      }

      const insertLine = db.prepare(`
        INSERT INTO order_lines (id, order_id, item_id, qty, unit_price_cents, name_snapshot, station)
        VALUES (@id, @order_id, @item_id, @qty, @unit_price_cents, @name_snapshot, @station)
      `);
      for (const l of bundle.order_lines) {
        insertLine.run({
          id: l.id,
          order_id: l.order_id,
          item_id: l.item_id,
          qty: l.qty,
          unit_price_cents: l.unit_price_cents ?? 0,
          name_snapshot: l.name_snapshot ?? '',
          station: l.station ?? ''
        });
      }

      const insertStock = db.prepare(`
        INSERT INTO stock (item_id, initial_qty, remaining_qty)
        VALUES (@item_id, @initial_qty, @remaining_qty)
      `);
      for (const s of bundle.stock) {
        insertStock.run({
          item_id: s.item_id,
          initial_qty: s.initial_qty,
          remaining_qty: s.remaining_qty
        });
      }

      const insertFloat = db.prepare(`
        INSERT INTO cash_floats (till_name, business_date, fondo_cents, counted_cents, updated_at)
        VALUES (@till_name, @business_date, @fondo_cents, @counted_cents, @updated_at)
      `);
      for (const c of bundle.cash_floats) {
        insertFloat.run({
          till_name: c.till_name,
          business_date: c.business_date,
          fondo_cents: c.fondo_cents ?? 0,
          counted_cents: c.counted_cents ?? null,
          updated_at: c.updated_at
        });
      }

      // Replace only the exported settings keys; leave the target machine's
      // printer/payment/till config untouched.
      for (const key of EXPORTED_SETTING_KEYS) {
        const value = (bundle.settings as Record<string, string>)[key];
        if (value != null) setSetting(key, value);
      }
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  return { orders: bundle.orders.length };
}
