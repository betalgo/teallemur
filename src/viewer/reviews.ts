// The hub's "Waiting for review" section: it opens and closes, and "Show
// all" reveals the rows past the first three. With no choice made yet it is
// open on desktop and closed on phones; the reader's choice is kept in this
// browser when storage allows, and the section still works when it does not.

import { STORAGE_PREFIX } from '../product.ts';
import { PHONE_QUERY } from './board.ts';
import { media } from './dom.ts';

/** Browser storage key for the reader's open or closed choice. */
export const REVIEWS_OPEN_KEY = `${STORAGE_PREFIX}:hub:reviews`;

function storedChoice(): boolean | null {
  try {
    const value = localStorage.getItem(REVIEWS_OPEN_KEY);
    return value === 'open' ? true : value === 'closed' ? false : null;
  } catch {
    return null; // Storage may be blocked; the default applies.
  }
}

function storeChoice(open: boolean): void {
  try {
    localStorage.setItem(REVIEWS_OPEN_KEY, open ? 'open' : 'closed');
  } catch {
    /* Optional: the choice is simply not kept. */
  }
}

/** Wires the review section on a page the CLI wrote (the hub). Does nothing when the page has none. */
export function mountReviewPanel(root: ParentNode = document): void {
  const panel = root.querySelector<HTMLElement>('.review-panel');
  const toggle = panel?.querySelector<HTMLButtonElement>('[data-reviews-toggle]');
  if (!panel || !toggle) return;

  const setOpen = (open: boolean): void => {
    panel.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  setOpen(storedChoice() ?? !media(PHONE_QUERY).matches);
  toggle.addEventListener('click', () => {
    const open = panel.dataset.open !== 'true';
    setOpen(open);
    storeChoice(open);
  });

  const more = panel.querySelector<HTMLButtonElement>('[data-reviews-more]');
  more?.addEventListener('click', () => {
    const all = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', String(all));
    for (const row of panel.querySelectorAll<HTMLElement>('.review-row[data-extra]')) row.hidden = !all;
  });
}
