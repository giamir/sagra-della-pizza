export type MenuItem = {
  id: string;
  name: string;
  price: number;
};

export type MenuGroup = {
  label: string;
  items: MenuItem[];
};

export type MenuCategory = {
  id: string;
  label: string;
  groups: MenuGroup[];
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
