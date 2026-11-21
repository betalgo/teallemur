// Top bars: the board's (lockup, product, sizes, search, Screens button)
// and the size control shared with the focus view: up to four sizes as
// buttons, more as the Size menu. A board of own sizes has no size control.

import type { Viewport } from '../model.ts';
import type { Context } from './context.ts';
import { debounce, h, icon, lockup, media } from './dom.ts';
import { count, humanize } from './format.ts';
import { MAX_SIZE_BUTTONS, sizeMenu, type SizeControl } from './sizemenu.ts';
import { STORAGE_PREFIX } from '../product.ts';

export interface SwitcherOptions {
  /** Equal segments across the width (the phone bottom bar). */
  fill?: boolean;
  extraClass?: string;
  /** Sizes the current page does not offer. */
  disabled?: (id: string) => boolean;
}

/** One button per size, the current one pressed. */
export function sizeSwitcher(viewports: Viewport[], current: string, pick: (id: string) => void, opts: SwitcherOptions = {}): HTMLElement {
  const group = h('div', {
    class: `switcher${opts.fill ? ' switcher--fill' : ''}${opts.extraClass ? ` ${opts.extraClass}` : ''}`,
    attrs: { role: 'group', 'aria-label': 'Size' },
  });
  for (const vp of viewports) {
    const b = h('button', {
      text: humanize(vp.id),
      attrs: {
        type: 'button',
        'aria-pressed': String(vp.id === current),
        title: `${vp.width} × ${vp.height}`,
        'data-viewport': vp.id,
        disabled: opts.disabled?.(vp.id) ?? false,
      },
    });
    b.addEventListener('click', () => pick(vp.id));
    group.append(b);
  }
  return group;
}

export function pressSize(group: HTMLElement, id: string): void {
  for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.getAttribute('data-viewport') === id));
  revealPressed(group);
}

/**
 * The sizes as buttons, or as the Size menu when there are more than four.
 * `fill` (equal segments across the width) applies to buttons only; the menu
 * fills its row on phones by itself.
 */
export function sizeControl(viewports: Viewport[], current: string, pick: (id: string) => void, opts: SwitcherOptions = {}): SizeControl {
  if (viewports.length > MAX_SIZE_BUTTONS) {
    const menuOpts: { extraClass?: string; disabled?: (id: string) => boolean } = {};
    if (opts.extraClass) menuOpts.extraClass = opts.extraClass;
    if (opts.disabled) menuOpts.disabled = opts.disabled;
    return sizeMenu(viewports, current, pick, menuOpts);
  }
  const el = sizeSwitcher(viewports, current, pick, opts);
  return { el, set: (id) => pressSize(el, id) };
}

/** Keeps the pressed size in view when the row scrolls sideways (phones). */
export function revealPressed(group: HTMLElement): void {
  const on = group.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (!on || group.scrollWidth <= group.clientWidth) return;
  group.scrollLeft = Math.max(0, on.offsetLeft - (group.clientWidth - on.offsetWidth) / 2);
}

function sizeKey(ctx: Context): string {
  return `${STORAGE_PREFIX}:size:${ctx.data.product.slug}`;
}

/** The size picked last time on this product, when it still exists. A board of own sizes has none. */
export function rememberedSize(ctx: Context): string | null {
  if (ctx.ownSizes) return null;
  try {
    const id = localStorage.getItem(sizeKey(ctx));
    return id && ctx.viewports.has(id) ? id : null;
  } catch {
    return null;
  }
}

function rememberSize(ctx: Context, id: string): void {
  try { localStorage.setItem(sizeKey(ctx), id); } catch { /* Optional. */ }
}

/** A search field: the icon, the input, and "/" or the number found. */
function searchField(fill: boolean): { el: HTMLElement; input: HTMLInputElement; status: HTMLElement } {
  const input = h('input', { attrs: { type: 'search', placeholder: 'Search screens', 'aria-label': 'Search screens', autocomplete: 'off' } });
  const status = h('span', { class: 'dv-search-status' }, h('kbd', { class: 'kbd', text: '/' }));
  const el = h('label', { class: `search-field${fill ? ' search-field--fill' : ' desktop-only'}` }, icon('search'), input, status);
  return { el, input, status };
}

export interface BoardBar {
  el: HTMLElement;
  /** The phone's search row under the top bar. */
  searchRow: HTMLElement;
  screens: HTMLButtonElement;
  showSidebar: HTMLButtonElement;
  focusSearch: () => void;
}

export function boardTopBar(ctx: Context, shown: () => number): BoardBar {
  const flows = ctx.data.board.filter((s) => s.kind === 'flow');
  const states = new Set(flows.flatMap((s) => s.lines.flatMap((l) => l.cells.map((c) => c.path))));
  const showSidebar = h(
    'button',
    { class: 'button button--quiet button--icon desktop-only dv-show-sidebar', attrs: { type: 'button', 'aria-label': 'Show the sidebar', 'aria-controls': 'dv-screens' } },
    icon('sidebar'),
  );
  // Every page at its own size: no size to pick.
  const sizes = ctx.ownSizes
    ? null
    : sizeControl(ctx.data.viewports, ctx.size, (id) => {
        rememberSize(ctx, id);
        ctx.setFilters({ viewports: new Set([id]) });
      }, { extraClass: 'top-bar__center' });

  const desk = searchField(false);
  const phone = searchField(true);
  const inputs = [desk.input, phone.input];
  const apply = debounce((value: string) => ctx.setFilters({ query: value }), 150);
  for (const input of inputs) {
    input.addEventListener('input', () => {
      for (const other of inputs) if (other !== input) other.value = input.value;
      apply(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        e.stopPropagation();
        for (const i of inputs) i.value = '';
        ctx.setFilters({ query: '' });
      }
    });
  }
  const searchRow = h('div', { class: 'dv-search-row phone-only', attrs: { hidden: true } }, phone.el);
  const searchButton = h(
    'button',
    { class: 'button button--quiet button--icon phone-only', attrs: { type: 'button', 'aria-label': 'Search screens', 'aria-expanded': 'false' } },
    icon('search'),
  );
  searchButton.addEventListener('click', () => {
    searchRow.hidden = !searchRow.hidden;
    searchButton.setAttribute('aria-expanded', String(!searchRow.hidden));
    if (!searchRow.hidden) phone.input.focus();
  });
  const screens = h(
    'button',
    { class: 'button phone-only', attrs: { type: 'button', 'aria-controls': 'dv-screens', 'aria-expanded': 'false' } },
    icon('sidebar'),
    'Screens',
  );

  const status = (): void => {
    const q = ctx.filters.query.trim();
    const n = shown();
    for (const field of [desk, phone]) {
      field.status.replaceChildren(q ? h('span', { class: 'search-field__count', text: n === 0 ? 'None found' : `${n} found` }) : field === desk ? h('kbd', { class: 'kbd', text: '/' }) : '');
    }
  };
  ctx.onFilters(() => {
    sizes?.set(ctx.size);
    for (const input of inputs) if (input.value !== ctx.filters.query) input.value = ctx.filters.query;
    // After the board has re-rendered.
    setTimeout(status, 0);
  });
  setTimeout(() => {
    status();
    if (sizes?.el.classList.contains('switcher')) revealPressed(sizes.el);
  }, 0);

  const el = h(
    'header',
    { class: sizes ? 'top-bar top-bar--centered top-bar--board' : 'top-bar' },
    h(
      'div',
      { class: 'top-bar__start' },
      showSidebar,
      lockup(true),
      h(
        'div',
        { class: 'top-bar__product' },
        h('strong', { text: ctx.data.product.name }),
        h('span', null, count(states.size, 'screen'), h('span', { class: 'desktop-only', text: ` in ${count(flows.length, 'flow')}` })),
      ),
    ),
    sizes ? sizes.el : h('span', { class: 'top-bar__spacer' }),
    h('div', { class: 'top-bar__end' }, desk.el, searchButton, screens),
  );
  const focusSearch = (): void => {
    if (media('(max-width: 767px)').matches) {
      searchRow.hidden = false;
      searchButton.setAttribute('aria-expanded', 'true');
      phone.input.focus();
    } else desk.input.focus();
  };
  return { el, searchRow, screens, showSidebar, focusSearch };
}
