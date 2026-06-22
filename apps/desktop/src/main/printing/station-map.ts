import { getSetting, setSetting } from '../db/schema.js';

// Default kitchen station labels, in print order. Acts as the seed for the
// user-managed station list (settings key `stations_list`).
export const STATION_ORDER = ['Pizza', 'Griglia e contorni', 'Crostini', 'Cecina', 'Cucina', 'Bevande', 'Bar', 'Dolce'];

export const DEFAULT_COPERTO_STATION = 'Bevande';

export function normalizeStation(station: string): string {
  if (station === 'Gastronomia') return 'Cucina';
  if (station === 'Griglia' || station === 'Contorni') return 'Griglia e contorni';
  return station;
}

// The live, user-managed station list (ordered = print order). Falls back to
// the default when unset or malformed.
export function getStations(): string[] {
  const raw = getSetting('stations_list');
  if (!raw) return [...STATION_ORDER];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length && parsed.every((s) => typeof s === 'string')) {
      return (parsed as string[]).map(normalizeStation);
    }
  } catch {
    // fall through
  }
  return [...STATION_ORDER];
}

export function saveStations(list: string[]): void {
  const clean = list.map((s) => normalizeStation(s.trim())).filter(Boolean);
  setSetting('stations_list', JSON.stringify(clean));
}

// The station whose kitchen ticket carries the coperti count.
export function getCopertoStation(): string {
  return normalizeStation(getSetting('coperto_station') || DEFAULT_COPERTO_STATION);
}

export function saveCopertoStation(name: string): void {
  setSetting('coperto_station', normalizeStation(name));
}

const MAP: Record<string, string> = {
  // Pizza
  margherita: 'Pizza', 'prosciutto-cotto': 'Pizza', cipolla: 'Pizza', wurstel: 'Pizza',
  'salame-piccante': 'Pizza', funghi: 'Pizza', 'funghi-salsiccia': 'Pizza', 'funghi-cotto': 'Pizza',
  salsiccia: 'Pizza', 'funghi-crudo': 'Pizza', 'prosciutto-crudo': 'Pizza', marinara: 'Pizza',
  napoli: 'Pizza', genova: 'Pizza', pisana: 'Pizza', 'salsiccia-cipolla': 'Pizza',
  'focaccina-sale-olio': 'Pizza', 'focaccia-cotto': 'Pizza', 'focaccia-crudo': 'Pizza',
  // Griglia e contorni
  salsicce: 'Griglia e contorni', 'bistecca-manzo-normale': 'Griglia e contorni', 'bistecca-manzo-al-sangue': 'Griglia e contorni',
  'bistecca-manzo-ben-cotta': 'Griglia e contorni', rosticciana: 'Griglia e contorni', 'bistecca-maiale': 'Griglia e contorni',
  // Crostini
  'crostini-romana': 'Crostini', 'crostini-alici': 'Crostini', 'crostini-misti': 'Crostini',
  // Cecina
  cecina: 'Cecina',
  // Cucina
  lasagne: 'Cucina', 'antipasto-toscano': 'Cucina', 'prosciutto-melone': 'Cucina', bruschetta: 'Cucina',
  // Contorni
  fagioli: 'Griglia e contorni', insalata: 'Griglia e contorni', patatine: 'Griglia e contorni', pomodori: 'Griglia e contorni',
  // Bevande
  'acqua-naturale-litro': 'Bevande', 'acqua-gassata-litro': 'Bevande', 'acqua-frizzante': 'Bevande',
  'acqua-naturale': 'Bevande', 'vino-bicchiere-rosso': 'Bevande', 'vino-bicchiere-bianco': 'Bevande',
  'vino-frizzante': 'Bevande', 'vino-bottiglia-rosso': 'Bevande', 'vino-bottiglia-bianco': 'Bevande',
  'vino-bottiglia-frizzante': 'Bevande', 'coca-cola-zero': 'Bevande', 'coca-cola': 'Bevande',
  fanta: 'Bevande', sprite: 'Bevande', 'the-limone': 'Bevande', 'the-pesca': 'Bevande',
  'birra-spina-grande': 'Bevande', 'birra-spina-piccola': 'Bevande', ipa: 'Bevande',
  // Bar
  caffe: 'Bar', 'caffe-corretto': 'Bar',
  'spumante-bottiglia': 'Bar', spumante: 'Bar',
  // Dolce
  'dolce-sagra': 'Dolce',
};

export function getStation(itemId: string): string {
  return MAP[itemId] ?? 'Altro';
}
