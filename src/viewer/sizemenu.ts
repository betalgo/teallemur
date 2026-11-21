// The Size menu: takes the size buttons' place when there are more than four
// sizes, which do not fit as buttons. One button names the current size and
// its pixels and opens a list of every size, the current one checked. Arrow
// keys, Home and End move through the list, Escape closes it and returns to
// the button, and a click outside closes it.

import type { Viewport } from '../model.ts';
import { h, icon, usingKeyboard } from './dom.ts';
import { humanize } from './format.ts';

/** Up to this many sizes show as buttons; more fold into the Size menu. */
export const MAX_SIZE_BUTTONS = 4;

/** A size control: the buttons or the menu, and how to show another size as current. */
export interface SizeControl {
  el: HTMLElement;
  set(id: string): void;
}

export interface SizeMenuOptions {
  extraClass?: string;
  /** Sizes the current page does not offer. */
  disabled?: (id: string) => boolean;
}

let menus = 0;

export function sizeMenu(viewports: Viewport[], current: string, pick: (id: string) => void, opts: SizeMenuOptions = {}): SizeControl {
  const listId = `dv-size-menu-${++menus}`;
  const name = h('span', { class: 'size-menu__name' });
  const dims = h('span', { class: 'size-menu__dims' });
  const button = h(
    'button',
    { class: 'size-menu__button', attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': listId } },
    h('span', { class: 'size-menu__label', text: 'Size' }),
    name,
    dims,
    icon('expanded'),
  );
  const options = viewports.map((vp) => {
    const option = h(
      'button',
      {
        class: 'size-menu__option',
        attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': 'false', 'data-viewport': vp.id, tabindex: -1, disabled: opts.disabled?.(vp.id) ?? false },
      },
      h('span'),
      h('span', { text: humanize(vp.id) }),
      h('span', { class: 'size-menu__option-dims', text: `${vp.width} × ${vp.height}` }),
    );
    option.addEventListener('click', () => {
      if (option.disabled) return;
      close(true);
      pick(vp.id);
    });
    return option;
  });
  const list = h('div', { class: 'size-menu__list', attrs: { id: listId, role: 'menu', 'aria-label': 'Size', hidden: true } }, ...options);
  const el = h('div', { class: `size-menu${opts.extraClass ? ` ${opts.extraClass}` : ''}` }, button, list);

  const enabled = (): HTMLButtonElement[] => options.filter((o) => !o.disabled);
  const onOutside = (e: Event): void => {
    if (!el.contains(e.target as Node | null)) close(false);
  };
  function open(): void {
    if (!list.hidden) return;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    const on = options.find((o) => o.getAttribute('aria-checked') === 'true' && !o.disabled) ?? enabled()[0];
    on?.focus({ focusVisible: usingKeyboard() } as FocusOptions);
    on?.scrollIntoView?.({ block: 'nearest' });
  }
  function close(returnFocus: boolean): void {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (returnFocus) button.focus();
  }

  button.addEventListener('click', () => (list.hidden ? open() : close(false)));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  });
  list.addEventListener('keydown', (e) => {
    const items = enabled();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    if (e.key === 'ArrowDown') next = items[(at + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(at - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    } else if (e.key === 'Tab') {
      close(false);
      return;
    } else return;
    e.preventDefault();
    next?.focus();
  });

  const set = (id: string): void => {
    const vp = viewports.find((v) => v.id === id);
    name.textContent = vp ? humanize(vp.id) : '';
    dims.textContent = vp ? `${vp.width} × ${vp.height}` : '';
    for (const o of options) {
      const on = o.getAttribute('data-viewport') === id;
      o.setAttribute('aria-checked', String(on));
      o.firstElementChild?.replaceWith(on ? icon('check') : h('span'));
    }
  };
  set(current);
  return { el, set };
}
