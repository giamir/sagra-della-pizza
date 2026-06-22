// Pure, dependency-free station constants & helpers.
// Kept separate from station-map.ts so that ticket templates can use them
// without pulling in the DB/Electron-backed settings code — which also makes
// the templates loadable from standalone tooling (e.g. the ticket preview).

// Default kitchen station labels, in print order. Acts as the seed for the
// user-managed station list (settings key `stations_list`).
export const STATION_ORDER = ['Pizza', 'Griglia e contorni', 'Crostini', 'Cecina', 'Cucina', 'Bevande', 'Bar', 'Dolce'];

export const DEFAULT_COPERTO_STATION = 'Bevande';

export function normalizeStation(station: string): string {
  if (station === 'Gastronomia') return 'Cucina';
  if (station === 'Griglia' || station === 'Contorni') return 'Griglia e contorni';
  return station;
}
