export type MenuItem = {
  id: string;
  name: string;
  price: number;
  description?: string;
  station?: string; // kitchen/print station for this item; overrides the category's station
  variants?: Array<{
    id: string;
    label: string;
  }>;
  optionalVariants?: boolean; // when true, the base item is orderable alongside its variants
  customizable?: boolean; // when true, this item exposes its category's add-on options
  excludeOptions?: string[]; // category option ids that don't apply to this item
};

export type MenuGroup = {
  label: string;
  items: MenuItem[];
};

export type MenuOption = {
  id: string;
  label: string;
  priceDelta: number; // added to item price, e.g. 1.50 for celiaci dough
  customizableOnly?: boolean; // when true, only offered on items marked customizable
};

export type MenuCategory = {
  id: string;
  label: string;
  subtitle?: string; // optional tagline shown under the category title in the ordering flow
  station?: string; // default kitchen/print station for every item in this category
  groups: MenuGroup[];
  options?: MenuOption[]; // optional add-ons available for every item in this category
};

export type Menu = {
  coperto: { perPersona: number };
  categories: MenuCategory[];
};

export type OrderState = {
  people: number;
  lines: Record<string, number>;
};

export type Payload = {
  v: 1;
  p: number;
  l: [string, number][];
  t: number;
};
