import { getDb } from './schema.js';

export type CashFloat = {
  tillName: string;
  fondoCents: number;
  countedCents: number | null;
};

type CashRow = {
  till_name: string;
  fondo_cents: number;
  counted_cents: number | null;
};

// All per-till fondo cassa rows for a single calendar day ('YYYY-MM-DD').
export function getCashFloats(date: string): CashFloat[] {
  const rows = getDb().prepare(`
    SELECT till_name, fondo_cents, counted_cents
    FROM cash_floats
    WHERE business_date = ?
    ORDER BY till_name
  `).all(date) as CashRow[];

  return rows.map((r) => ({
    tillName: r.till_name,
    fondoCents: r.fondo_cents,
    countedCents: r.counted_cents
  }));
}

// Upsert the fondo (and optional counted amount) for one till on one day.
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
  `).run({
    tillName,
    date,
    fondoCents,
    countedCents,
    updatedAt: new Date().toISOString()
  });
}
