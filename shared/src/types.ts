export type MenuItem = {
  id: string;
  name: string;
  price: number;
  description?: string;
  variants?: Array<{
    id: string;
    label: string;
  }>;
  optionalVariants?: boolean; // when true, the base item is orderable alongside its variants
};

export type MenuGroup = {
  label: string;
  items: MenuItem[];
};

export type MenuOption = {
  id: string;
  label: string;
  priceDelta: number; // added to item price, e.g. 1.50 for celiaci dough
};

export type MenuCategory = {
  id: string;
  label: string;
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
