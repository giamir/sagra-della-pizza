import menu from '@sagra/shared/data/menu.json';
import type { Menu, OrderState } from '$lib/types';
import { computeTotal, itemsCount } from '$lib/utils/pricing';

const STORAGE_KEY = 'sagra-order-v1';
const MENU = menu as Menu;

function loadInitial(): OrderState {
  if (typeof localStorage === 'undefined') return { people: 2, lines: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { people: 2, lines: {} };
    const parsed = JSON.parse(raw) as OrderState;
    if (typeof parsed.people !== 'number' || typeof parsed.lines !== 'object') {
      return { people: 2, lines: {} };
    }
    const legacySteakQty = parsed.lines['bistecca-manzo'];
    if (legacySteakQty > 0) {
      parsed.lines['bistecca-manzo-normale'] =
        (parsed.lines['bistecca-manzo-normale'] ?? 0) + legacySteakQty;
      delete parsed.lines['bistecca-manzo'];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    sessionStorage.removeItem(STORAGE_KEY);
    return parsed;
  } catch {
    return { people: 2, lines: {} };
  }
}

export const order: OrderState = $state(loadInitial());

export function persist() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

export function setPeople(n: number) {
  order.people = Math.max(1, Math.min(20, Math.floor(n)));
  persist();
}

export function getQty(id: string): number {
  return order.lines[id] ?? 0;
}

export function inc(id: string) {
  order.lines[id] = (order.lines[id] ?? 0) + 1;
  persist();
}

export function dec(id: string) {
  const cur = order.lines[id] ?? 0;
  if (cur <= 1) delete order.lines[id];
  else order.lines[id] = cur - 1;
  persist();
}

export function setQty(id: string, qty: number) {
  const q = Math.max(0, Math.floor(qty));
  if (q === 0) delete order.lines[id];
  else order.lines[id] = q;
  persist();
}

export function clearOrder() {
  order.people = 2;
  for (const k of Object.keys(order.lines)) delete order.lines[k];
  persist();
}

export function total(): number {
  return computeTotal(order, MENU);
}

export function count(): number {
  return itemsCount(order);
}

export { MENU };
