import type { Menu, OrderState } from '$lib/types';

export function buildPriceIndex(menu: Menu): Record<string, { name: string; price: number }> {
  const idx: Record<string, { name: string; price: number }> = {};
  for (const cat of menu.categories) {
    for (const group of cat.groups) {
      for (const item of group.items) {
        if (item.variants?.length) {
          // Keep generic item IDs readable for QR codes created before variants existed.
          idx[item.id] = { name: item.name, price: item.price };
          for (const variant of item.variants) {
            idx[variant.id] = {
              name: `${item.name} - ${variant.label}`,
              price: item.price
            };
          }
        } else {
          idx[item.id] = { name: item.name, price: item.price };
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
