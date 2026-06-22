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

// A complete item-id → station map for every catalog item (and variant), with
// overrides applied and the hardcoded map as fallback. The catalog admin uses
// this so every item shows an explicit station (no "auto" fallthrough).
export function getResolvedStations(): Record<string, string> {
  const catalog = getCatalog();
  const overrides = getStationOverrides();
  const result: Record<string, string> = {};
  for (const cat of catalog.categories) {
    for (const group of cat.groups) {
      for (const item of group.items) {
        const station = normalizeStation(overrides[item.id] ?? getStation(item.id));
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

// Resolves station for a cart key, checking overrides first then the hardcoded
// map. Composite option keys (e.g. `margherita||senza-mozzarella`) are decoded
// to their base item id so options don't fall through to the "Altro" station.
export function resolveStation(cartKey: string): string {
  const { itemId } = decodeCartKey(cartKey);
  const overrides = getStationOverrides();
  return normalizeStation(overrides[itemId] ?? getStation(itemId));
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
