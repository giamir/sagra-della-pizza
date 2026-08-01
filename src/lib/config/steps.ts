// The ordering wizard's linear step list, generated from the active menu so the
// flow follows whatever categories the tenant defined. Persone leads only when
// the tenant charges a coperto; Riepilogo always closes. Single-sourced here
// because the step order is needed by the nav, the layout's Avanti button and
// the landing-page CTA, which used to drift apart.
import menu from '@sagra/shared/data/menu.json';
import type { Menu } from '$lib/types';
import { copertoEnabled } from '$lib/config/tenant';

export type OrderStep = { href: string; label: string };

export const ORDER_STEPS: OrderStep[] = [
  ...(copertoEnabled ? [{ href: '/ordina/persone', label: 'Persone' }] : []),
  ...(menu as Menu).categories.map((c) => ({ href: `/ordina/${c.id}`, label: c.label })),
  { href: '/ordina/riepilogo', label: 'Riepilogo' }
];

/** Where "Inizia il tuo ordine" lands. */
export const FIRST_STEP_HREF = ORDER_STEPS[0].href;
