export const STATION_ORDER = ['Pizza', 'Griglia e contorni', 'Crostini', 'Cecina', 'Cucina', 'Bevande'];

export function normalizeStation(station: string): string {
  if (station === 'Gastronomia') return 'Cucina';
  if (station === 'Griglia' || station === 'Contorni') return 'Griglia e contorni';
  return station;
}
