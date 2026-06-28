import tenant from '../config/tenant.json';

// Locale + currency come from the active tenant config. Name kept as `formatEUR`
// for call-site stability even though the currency is now configurable.
const formatter = new Intl.NumberFormat(tenant.locale.intl, {
  style: 'currency',
  currency: tenant.locale.currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatEUR(amount: number): string {
  return formatter.format(amount);
}
