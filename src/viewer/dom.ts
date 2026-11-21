// Tiny DOM helpers.

import { PRODUCT_NAME } from '../product.ts';
import { iconHtml, type IconName } from './icons.ts';
import { MARK_FILE } from './marks.ts';

type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  style?: Partial<Record<string, string>>;
  on?: Partial<Record<string, (event: Event) => void>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = props.text;
    for (const [k, v] of Object.entries(props.attrs ?? {})) {
      if (v === null || v === undefined || v === false) continue;
      el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const [k, v] of Object.entries(props.style ?? {})) {
      if (v !== undefined) el.style.setProperty(k, v);
    }
    for (const [k, fn] of Object.entries(props.on ?? {})) {
      if (fn) el.addEventListener(k, fn);
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

/** A line icon (`.icon`), hidden from assistive technology. */
export function icon(name: IconName, extraClass = ''): Element {
  const holder = document.createElement('span');
  holder.innerHTML = iconHtml(name, extraClass);
  return holder.firstElementChild as Element;
}

/**
 * The viewer folder's URL relative to the page, ending in a slash, read from
 * the script tag that loaded the viewer ('' when there is none, as in tests).
 */
export function viewerFolder(): string {
  const src = document.querySelector('script[src$="viewer.js"]')?.getAttribute('src') ?? '';
  return src.slice(0, src.length - 'viewer.js'.length);
}

/** The mark and wordmark. On phones only the mark shows when `markOnPhone`. */
export function lockup(markOnPhone: boolean): HTMLElement {
  return h(
    'span',
    { class: `lockup${markOnPhone ? ' lockup--mark-on-phone' : ''}`, attrs: { title: PRODUCT_NAME } },
    h('img', { class: 'mark', attrs: { src: `${viewerFolder()}${MARK_FILE}`, alt: '' } }),
    h('span', { class: 'wordmark', text: PRODUCT_NAME }),
  );
}

/** A media query list, or a never-matching stand-in where the page has none (tests). */
export function media(query: string): Pick<MediaQueryList, 'matches' | 'addEventListener'> {
  if (typeof matchMedia === 'function') return matchMedia(query);
  return { matches: false, addEventListener: () => undefined };
}

/** A computed style value in pixels, or 0 where styles are not computed (tests). */
export function cssPx(el: Element, prop: string): number {
  if (typeof getComputedStyle !== 'function') return 0;
  return parseFloat(getComputedStyle(el).getPropertyValue(prop) || '0') || 0;
}

let keyboard = false;
/** Whether the last input was a key press rather than a pointer, so focus moved by the viewer shows its ring only then. */
export function usingKeyboard(): boolean {
  return keyboard;
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', () => { keyboard = true; }, true);
  document.addEventListener('pointerdown', () => { keyboard = false; }, true);
}

export function px(n: number): string {
  return `${Math.round(n * 100) / 100}px`;
}

/** Copies text to the clipboard, with a fallback for pages without the async clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { attrs: { readonly: true, 'aria-hidden': 'true' }, class: 'dv-offscreen' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Calls fn after the viewport width changes. Height-only resizes (a phone's
 * address bar showing or hiding while scrolling) are ignored so frames are
 * not reloaded.
 */
export function onWidthChange(fn: () => void): void {
  let last = document.documentElement.clientWidth;
  window.addEventListener(
    'resize',
    debounce(() => {
      const width = document.documentElement.clientWidth;
      if (width === last) return;
      last = width;
      fn();
    }, 150),
  );
}
