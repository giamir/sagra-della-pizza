import type { Menu, MenuOption, OrderState } from '../types.js';

// Composite cart key separator.  Item IDs are kebab-case so '||' never appears naturally.
const SEP = '||';

export function encodeCartKey(itemId: string, optionIds: string[]): string {
  if (optionIds.length === 0) return itemId;
  return `${itemId}${SEP}${[...optionIds].sort().join(',')}`;
}

export function decodeCartKey(key: string): { itemId: string; optionIds: string[] } {
  const idx = key.indexOf(SEP);
  if (idx === -1) return { itemId: key, optionIds: [] };
  return { itemId: key.slice(0, idx), optionIds: key.slice(idx + SEP.length).split(',') };
}

// Returns all non-empty subsets of an array (2^n - 1 combinations).
function subsets<T>(arr: T[]): T[][] {
  const result: T[][] = [];
  const total = 1 << arr.length;
  for (let mask = 1; mask < total; mask++) {
    result.push(arr.filter((_, i) => mask & (1 << i)));
  }
  return result;
}

export function buildPriceIndex(menu: Menu): Record<string, { name: string; price: number; categoryLabel: string }> {
  const idx: Record<string, { name: string; price: number; categoryLabel: string }> = {};

  for (const cat of menu.categories) {
    const catOptions: MenuOption[] = cat.options ?? [];

    for (const group of cat.groups) {
      for (const item of group.items) {
        if (item.variants?.length) {
          idx[item.id] = { name: item.name, price: item.price, categoryLabel: cat.label };
          for (const variant of item.variants) {
            idx[variant.id] = { name: `${item.name} - ${variant.label}`, price: item.price, categoryLabel: cat.label };
          }
        } else {
          idx[item.id] = { name: item.name, price: item.price, categoryLabel: cat.label };
        }

        // Generate composite key entries for every non-empty option combination.
        if (catOptions.length > 0) {
          for (const combo of subsets(catOptions)) {
            const optionIds = combo.map((o) => o.id);
            const optLabel = combo.map((o) => o.label).join(', ');
            const extraPrice = combo.reduce((s, o) => s + o.priceDelta, 0);

            if (item.variants?.length) {
              for (const variant of item.variants) {
                const key = encodeCartKey(variant.id, optionIds);
                idx[key] = { name: `${item.name} - ${variant.label} [${optLabel}]`, price: item.price + extraPrice, categoryLabel: cat.label };
              }
            } else {
              const key = encodeCartKey(item.id, optionIds);
              idx[key] = { name: `${item.name} [${optLabel}]`, price: item.price + extraPrice, categoryLabel: cat.label };
            }
          }
        }
      }
    }
  }

  return idx;
}

export function computeTotal(order: OrderState, menu: Menu): number {
  const idx = buildPriceIndex(menu);
  let total = 0;
  for (const [id, qty] of Object.entries(order.lines)) {
    const item = idx[id];
    if (item) total += item.price * qty;
  }
  total += menu.coperto.perPersona * order.people;
  return Math.round(total * 100) / 100;
}

export function itemsCount(order: OrderState): number {
  return Object.values(order.lines).reduce((a, b) => a + b, 0);
}
