// Maps item IDs to kitchen station labels, in print order.
export const STATION_ORDER = ['Pizza', 'Griglia', 'Crostini', 'Cecina', 'Gastronomia', 'Contorni', 'Bevande'];

export function normalizeStation(station: string): string {
  return station === 'Cucina' ? 'Gastronomia' : station;
}

const MAP: Record<string, string> = {
  // Pizza
  margherita: 'Pizza', 'prosciutto-cotto': 'Pizza', cipolla: 'Pizza', wurstel: 'Pizza',
  'salame-piccante': 'Pizza', funghi: 'Pizza', 'funghi-salsiccia': 'Pizza', 'funghi-cotto': 'Pizza',
  salsiccia: 'Pizza', 'funghi-crudo': 'Pizza', 'prosciutto-crudo': 'Pizza', marinara: 'Pizza',
  napoli: 'Pizza', genova: 'Pizza', pisana: 'Pizza', 'salsiccia-cipolla': 'Pizza',
  'focaccina-sale-olio': 'Pizza', 'focaccia-cotto': 'Pizza', 'focaccia-crudo': 'Pizza',
  'margherita-bianca': 'Pizza', 'margherita-rossa': 'Pizza',
  'napoli-bianca': 'Pizza', 'napoli-rossa': 'Pizza',
  'salsiccia-bianca': 'Pizza', 'salsiccia-rossa': 'Pizza',
  'cipolla-bianca': 'Pizza', 'cipolla-rossa': 'Pizza',
  'prosciutto-cotto-bianca': 'Pizza', 'prosciutto-cotto-rossa': 'Pizza',
  'prosciutto-crudo-bianca': 'Pizza', 'prosciutto-crudo-rossa': 'Pizza',
  'funghi-bianca': 'Pizza', 'funghi-rossa': 'Pizza',
  'wurstel-bianca': 'Pizza', 'wurstel-rossa': 'Pizza',
  'salame-piccante-bianca': 'Pizza', 'salame-piccante-rossa': 'Pizza',
  'funghi-salsiccia-bianca': 'Pizza', 'funghi-salsiccia-rossa': 'Pizza',
  'funghi-cotto-bianca': 'Pizza', 'funghi-cotto-rossa': 'Pizza',
  'funghi-crudo-bianca': 'Pizza', 'funghi-crudo-rossa': 'Pizza',
  'salsiccia-cipolla-bianca': 'Pizza', 'salsiccia-cipolla-rossa': 'Pizza',
  // Griglia
  salsicce: 'Griglia', 'bistecca-manzo-normale': 'Griglia', 'bistecca-manzo-al-sangue': 'Griglia',
  'bistecca-manzo-ben-cotta': 'Griglia', rosticciana: 'Griglia', 'bistecca-maiale': 'Griglia',
  // Crostini
  'crostini-romana': 'Crostini', 'crostini-alici': 'Crostini', 'crostini-misti': 'Crostini',
  // Cecina
  cecina: 'Cecina',
  // Gastronomia
  lasagne: 'Gastronomia', 'antipasto-toscano': 'Gastronomia', 'prosciutto-melone': 'Gastronomia', bruschetta: 'Gastronomia',
  // Contorni
  fagioli: 'Contorni', insalata: 'Contorni', patatine: 'Contorni', pomodori: 'Contorni',
  // Bevande
  'acqua-naturale-litro': 'Bevande', 'acqua-gassata-litro': 'Bevande', 'acqua-frizzante': 'Bevande',
  'acqua-naturale': 'Bevande', 'vino-bicchiere-rosso': 'Bevande', 'vino-bicchiere-bianco': 'Bevande',
  'vino-frizzante': 'Bevande', 'vino-bottiglia-rosso': 'Bevande', 'vino-bottiglia-bianco': 'Bevande',
  'vino-bottiglia-frizzante': 'Bevande', 'coca-cola-zero': 'Bevande', 'coca-cola': 'Bevande',
  fanta: 'Bevande', sprite: 'Bevande', 'the-limone': 'Bevande', 'the-pesca': 'Bevande',
  'birra-spina-grande': 'Bevande', 'birra-spina-piccola': 'Bevande', ipa: 'Bevande',
  // Bar (same station as Bevande)
  caffe: 'Bevande', 'dolce-sagra': 'Bevande', 'caffe-corretto': 'Bevande',
  'spumante-bottiglia': 'Bevande', spumante: 'Bevande',
};

export function getStation(itemId: string): string {
  return MAP[itemId] ?? 'Altro';
}
