import menu from '@sagra/shared/data/menu.json';
import type { Menu, OrderState } from '$lib/types';
import { computeTotal, itemsCount } from '$lib/utils/pricing';
import { copertoEnabled, storageKey } from '$lib/config/tenant';

const STORAGE_KEY = storageKey('order-v1');
const MENU = menu as Menu;

// Tenants without a cover charge keep people at 0 — computeTotal multiplies the
// two, so this (not a zero `coperto.perPersona`) is what keeps the charge out of
// every total, the QR payload and the till.
const DEFAULT_PEOPLE = copertoEnabled ? 2 : 0;

function loadInitial(): OrderState {
  if (typeof localStorage === 'undefined') return { people: DEFAULT_PEOPLE, lines: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { people: DEFAULT_PEOPLE, lines: {} };
    const parsed = JSON.parse(raw) as OrderState;
    if (typeof parsed.people !== 'number' || typeof parsed.lines !== 'object') {
      return { people: DEFAULT_PEOPLE, lines: {} };
    }
    // Scrub carts saved before the flag was turned off.
    if (!copertoEnabled) parsed.people = 0;
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
    return { people: DEFAULT_PEOPLE, lines: {} };
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
  if (!copertoEnabled) return;
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
  order.people = DEFAULT_PEOPLE;
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
