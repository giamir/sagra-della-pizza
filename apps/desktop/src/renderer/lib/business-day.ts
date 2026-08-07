// Virtual midnight: the business day rolls over at 06:00, not 00:00. A sagra
// serves until (past) midnight, so an order at 00:30 belongs to the evening
// that just ended — "Oggi" stats, report ranges and CSV day keys all follow
// this boundary instead of the calendar one.
export const DAY_ROLLOVER_HOUR = 6;

/** Start of the business day `now` falls in: today at 06:00, or yesterday at
 *  06:00 when the clock is past midnight but before the rollover. */
export function startOfBusinessDay(now: Date = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_ROLLOVER_HOUR);
  if (now.getHours() < DAY_ROLLOVER_HOUR) start.setDate(start.getDate() - 1);
  return start;
}

/** Local YYYY-MM-DD key of the business day `now` falls in (the calendar date
 *  its 06:00 start belongs to). */
export function businessDayKey(now: Date = new Date()): string {
  const s = startOfBusinessDay(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
}

/** [from, to] ISO range covering the business days of the given calendar dates
 *  (YYYY-MM-DD): from 06:00 on `fromDay` up to 06:00 on the day after `toDay`. */
export function businessDayRange(fromDay: string, toDay: string): [string, string] {
  const from = new Date(`${fromDay}T00:00:00`);
  from.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0);
  const to = new Date(`${toDay}T00:00:00`);
  to.setDate(to.getDate() + 1);
  to.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0);
  to.setMilliseconds(-1);
  return [from.toISOString(), to.toISOString()];
}
