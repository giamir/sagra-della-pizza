import menuData from '@sagra/shared/data/menu.json';
import type { Menu } from '@sagra/shared/types';
import { getSetting, setSetting } from '../db/schema.js';
import { getStation } from '../printing/station-map.js';
import { buildPriceIndex } from '@sagra/shared/utils/pricing';

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
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveStationOverrides(overrides: Record<string, string>): void {
  setSetting('station_overrides', JSON.stringify(overrides));
}

// Resolves station for an item, checking overrides first then the hardcoded map.
export function resolveStation(itemId: string): string {
  const overrides = getStationOverrides();
  return overrides[itemId] ?? getStation(itemId);
}

export function getLivePriceIndex(): ReturnType<typeof buildPriceIndex> {
  return buildPriceIndex(getCatalog());
}
