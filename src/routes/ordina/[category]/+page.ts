import { error } from '@sveltejs/kit';
import menu from '@sagra/shared/data/menu.json';
import type { Menu } from '$lib/types';

const MENU = menu as Menu;

// Prerender one page per menu category (the route inherits prerender = true
// from the root layout). This is what makes the ordering flow tenant-driven:
// the categories come from the active menu.json, not hardcoded routes.
export const entries = () => MENU.categories.map((c) => ({ category: c.id }));

export function load({ params }: { params: { category: string } }) {
  const category = MENU.categories.find((c) => c.id === params.category);
  if (!category) throw error(404, 'Categoria non trovata');
  return { categoryId: category.id };
}
