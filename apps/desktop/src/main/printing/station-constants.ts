// Pure, dependency-free station constants & helpers.
// Kept separate from station-map.ts so that ticket templates can use them
// without pulling in the DB/Electron-backed settings code — which also makes
// the templates loadable from standalone tooling (e.g. the ticket preview).
// The tenant config it reads is plain JSON, so this stays DB/Electron-free.
import { tenant } from '../config/tenant.js';

// Default kitchen station labels, in print order. Acts as the seed for the
// user-managed station list (settings key `stations_list`).
export const STATION_ORDER = [...tenant.stations.order];

export const DEFAULT_COPERTO_STATION = tenant.stations.copertoStation;

// Collapse legacy/alias station names onto canonical ones (e.g. Gastronomia → Cucina).
export function normalizeStation(station: string): string {
  return tenant.stations.aliases[station] ?? station;
}
