import menuData from '@sagra/shared/data/menu.json';
import type { Menu } from '@sagra/shared/types';
import { getSetting, setSetting } from '../db/schema.js';
import { getStation, normalizeStation } from '../printing/station-map.js';
import { buildPriceIndex } from '@sagra/shared/utils/pricing';
import { buildStockIdIndex, stockIdForCartKey } from '@sagra/shared/utils/stock';
import { decodeCartKey } from '@sagra/shared/utils/pricing';

export function getCatalog(): Menu {
  const raw = getSetting('catalog_json');
  if (!raw) return menuData as Menu;
  try {
    return JSON.parse(raw) as Menu;
  } catch {
    return menuData as Menu;
  }
}

export function saveCatalog(catalog: Menu): void {
  setSetting('catalog_json', JSON.stringify(catalog));
}

// Drops this till's locally-saved catalog so getCatalog() falls back to the
// menu bundled with the installed app version. Used to adopt a menu shipped in
// an app update (e.g. new options/variants the in-app editor can't express).
// Station overrides are left untouched — they are this machine's print routing.
export function resetCatalog(): void {
  setSetting('catalog_json', '');
}

export function getStationOverrides(): Record<string, string> {
  const raw = getSetting('station_overrides');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(Object.entries(parsed).map(([itemId, station]) => [itemId, normalizeStation(station)]));
  } catch {
    return {};
  }
}

export function saveStationOverrides(overrides: Record<string, string>): void {
  const normalized = Object.fromEntries(Object.entries(overrides).map(([itemId, station]) => [itemId, normalizeStation(station)]));
  setSetting('station_overrides', JSON.stringify(normalized));
}

// Item-id → station declared in the catalog itself: the item's own `station`
// first, then its category's. Variants inherit the resolved item station.
// Tenant menus use this instead of the legacy hardcoded map in station-map.ts.
function getDeclaredStations(catalog: Menu): Record<string, string> {
  const result: Record<string, string> = {};
  for (const cat of catalog.categories) {
    for (const group of cat.groups) {
      for (const item of group.items) {
        const station = item.station ?? cat.station;
        if (!station) continue;
        result[item.id] = station;
        if (item.variants) {
          for (const v of item.variants) result[v.id] = station;
        }
      }
    }
  }
  return result;
}

// A complete item-id → station map for every catalog item (and variant), with
// overrides applied, then catalog-declared stations, then the hardcoded map as
// fallback. The catalog admin uses this so every item shows an explicit
// station (no "auto" fallthrough).
export function getResolvedStations(): Record<string, string> {
  const catalog = getCatalog();
  const overrides = getStationOverrides();
  const declared = getDeclaredStations(catalog);
  const result: Record<string, string> = {};
  for (const cat of catalog.categories) {
    for (const group of cat.groups) {
      for (const item of group.items) {
        const station = normalizeStation(overrides[item.id] ?? declared[item.id] ?? getStation(item.id));
        result[item.id] = station;
        if (item.variants) {
          for (const v of item.variants) {
            result[v.id] = normalizeStation(overrides[v.id] ?? station);
          }
        }
      }
    }
  }
  return result;
}

// Resolves station for a cart key, checking overrides first, then the
// catalog-declared station, then the hardcoded map. Composite option keys
// (e.g. `margherita||senza-mozzarella`) are decoded to their base item id so
// options don't fall through to the "Altro" station.
export function resolveStation(cartKey: string): string {
  const { itemId } = decodeCartKey(cartKey);
  const overrides = getStationOverrides();
  const declared = getDeclaredStations(getCatalog());
  return normalizeStation(overrides[itemId] ?? declared[itemId] ?? getStation(itemId));
}

export function getLivePriceIndex(): ReturnType<typeof buildPriceIndex> {
  return buildPriceIndex(getCatalog());
}

export function getLiveStockIdIndex(): ReturnType<typeof buildStockIdIndex> {
  return buildStockIdIndex(getCatalog());
}

export function resolveStockItemId(lineId: string): string {
  return stockIdForCartKey(lineId, getLiveStockIdIndex());
}
