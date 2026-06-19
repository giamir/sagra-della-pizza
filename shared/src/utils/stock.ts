import type { Menu } from '../types.js';
import { decodeCartKey } from './pricing.js';

export function buildStockIdIndex(menu: Menu): Record<string, string> {
  const index: Record<string, string> = {};

  for (const cat of menu.categories) {
    for (const group of cat.groups) {
      for (const item of group.items) {
        index[item.id] = item.id;
        for (const variant of item.variants ?? []) {
          index[variant.id] = item.id;
        }
      }
    }
  }

  return index;
}

export function stockIdForCartKey(key: string, stockIdIndex: Record<string, string>): string {
  const { itemId } = decodeCartKey(key);
  return stockIdIndex[itemId] ?? itemId;
}
