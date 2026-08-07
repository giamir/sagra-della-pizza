import { getDb } from './schema.js';

export type CashFloat = {
  tillName: string;
  fondoCents: number;
  countedCents: number | null;
  closedAt: string | null;
  takingsCashCents: number | null;
};

type CashRow = {
  till_name: string;
  fondo_cents: number;
  counted_cents: number | null;
  closed_at: string | null;
  takings_cash_cents: number | null;
};

function toFloat(r: CashRow): CashFloat {
  return {
    tillName: r.till_name,
    fondoCents: r.fondo_cents,
    countedCents: r.counted_cents,
    closedAt: r.closed_at,
    takingsCashCents: r.takings_cash_cents
  };
}

// All per-till fondo cassa rows for a single business day ('YYYY-MM-DD').
export function getCashFloats(date: string): CashFloat[] {
  const rows = getDb().prepare(`
    SELECT till_name, fondo_cents, counted_cents, closed_at, takings_cash_cents
    FROM cash_floats
    WHERE business_date = ?
    ORDER BY till_name
  `).all(date) as CashRow[];
  return rows.map(toFloat);
}

// Upsert the fondo (and optional counted amount) for one till on one day.
// A finalized (closed) row is immutable: the DO UPDATE is skipped until reopened.
export function setCashFloat(
  tillName: string,
  date: string,
  fondoCents: number,
  countedCents: number | null
): void {
  getDb().prepare(`
    INSERT INTO cash_floats (till_name, business_date, fondo_cents, counted_cents, updated_at)
    VALUES (@tillName, @date, @fondoCents, @countedCents, @updatedAt)
    ON CONFLICT(till_name, business_date) DO UPDATE SET
      fondo_cents   = excluded.fondo_cents,
      counted_cents = excluded.counted_cents,
      updated_at    = excluded.updated_at
    WHERE cash_floats.closed_at IS NULL
  `).run({
    tillName,
    date,
    fondoCents,
    countedCents,
    updatedAt: new Date().toISOString()
  });
}

// Finalize a till's closing: lock the row and pin the day's cash takings so a
// late-syncing or voided order can't change an already-counted drawer's expected.
export function closeCashDay(tillName: string, date: string, takingsCashCents: number): void {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO cash_floats (till_name, business_date, fondo_cents, counted_cents, updated_at, closed_at, takings_cash_cents)
    VALUES (@tillName, @date, 0, NULL, @now, @now, @takings)
    ON CONFLICT(till_name, business_date) DO UPDATE SET
      closed_at          = @now,
      takings_cash_cents = @takings,
      updated_at         = @now
  `).run({ tillName, date, now, takings: takingsCashCents });
}

// Reopen a finalized closing so its figures can be edited again. The pinned
// takings are dropped: an open day is live by definition.
export function reopenCashDay(tillName: string, date: string): void {
  getDb().prepare(`
    UPDATE cash_floats
    SET closed_at = NULL, takings_cash_cents = NULL, updated_at = @now
    WHERE till_name = @tillName AND business_date = @date
  `).run({ tillName, date, now: new Date().toISOString() });
}

export type CashHistoryRow = {
  date: string; // business day, 'YYYY-MM-DD' (06:00 rollover)
  tillName: string;
  cashCents: number; // live cash takings of that business day
  orders: number;
  fondoCents: number;
  countedCents: number | null;
  closedAt: string | null;
  takingsCashCents: number | null;
};

// Day-by-day closing history: every business day with paid orders, merged with
// any saved chiusura rows (so a finalized figure shows even if its orders were
// purged). The business day follows the 06:00 virtual midnight in local time,
// matching the renderer's businessDayKey.
export function getCashHistory(): CashHistoryRow[] {
  const db = getDb();
  const takings = db.prepare(`
    SELECT date(created_at, 'localtime', '-6 hours') AS business_date,
           till_name,
           SUM(CASE WHEN payment_method = 'cash' THEN total_cents ELSE 0 END) AS cash_cents,
           COUNT(*) AS orders
    FROM orders
    WHERE status = 'paid'
    GROUP BY business_date, till_name
  `).all() as { business_date: string; till_name: string; cash_cents: number; orders: number }[];

  const floats = db.prepare(`
    SELECT business_date, till_name, fondo_cents, counted_cents, closed_at, takings_cash_cents
    FROM cash_floats
  `).all() as (CashRow & { business_date: string })[];

  const byKey = new Map<string, CashHistoryRow>();
  for (const t of takings) {
    byKey.set(`${t.business_date}|${t.till_name}`, {
      date: t.business_date,
      tillName: t.till_name,
      cashCents: t.cash_cents,
      orders: t.orders,
      fondoCents: 0,
      countedCents: null,
      closedAt: null,
      takingsCashCents: null
    });
  }
  for (const f of floats) {
    const key = `${f.business_date}|${f.till_name}`;
    const row = byKey.get(key) ?? {
      date: f.business_date,
      tillName: f.till_name,
      cashCents: 0,
      orders: 0,
      fondoCents: 0,
      countedCents: null,
      closedAt: null,
      takingsCashCents: null
    };
    row.fondoCents = f.fondo_cents;
    row.countedCents = f.counted_cents;
    row.closedAt = f.closed_at;
    row.takingsCashCents = f.takings_cash_cents;
    byKey.set(key, row);
  }

  return [...byKey.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.tillName.localeCompare(b.tillName)
  );
}
