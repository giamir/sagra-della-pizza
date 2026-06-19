export const STATION_ORDER = ['Pizza', 'Griglia', 'Crostini', 'Cecina', 'Gastronomia', 'Contorni', 'Bevande'];

export function normalizeStation(station: string): string {
  return station === 'Cucina' ? 'Gastronomia' : station;
}
