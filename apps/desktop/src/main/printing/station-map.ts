// Maps item IDs to kitchen station labels, in print order.
export const STATION_ORDER = ['Pizza', 'Griglia e contorni', 'Crostini', 'Cecina', 'Cucina', 'Bevande', 'Bar'];

export function normalizeStation(station: string): string {
  if (station === 'Gastronomia') return 'Cucina';
  if (station === 'Griglia' || station === 'Contorni') return 'Griglia e contorni';
  return station;
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
  // Bar (includes dolci)
  caffe: 'Bar', 'dolce-sagra': 'Bar', 'caffe-corretto': 'Bar',
  'spumante-bottiglia': 'Bar', spumante: 'Bar',
};

export function getStation(itemId: string): string {
  return MAP[itemId] ?? 'Altro';
}
