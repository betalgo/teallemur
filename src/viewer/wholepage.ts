// Whole pages in a preview. A changed, added or option page shows top to
// bottom: once its frame loads, the page's full height at its size is read
// from the same-origin document (nothing is added to the design file), and
// its box grows to it; parts sized to the screen stay the size's screen
// high (holdScreen). Before and after of a change share one height, the
// taller page's. A page that fits its size, scrolls inside its own areas or
// does not scroll keeps the size's height, as does a frame not loaded yet.
// Board frames show the first screen only and do not use this.

import type { Cell, Viewport } from '../model.ts';

/** Whether a document's window scrolls: not when its root, or its body under a visible root, hides what overflows. */
function scrolls(doc: Document): boolean {
  const view = doc.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return true;
  const hides = (el: Element | null): boolean | null => {
    if (!el) return null;
    const y = view.getComputedStyle(el).overflowY;
    return y === 'visible' || y === '' ? null : y === 'hidden' || y === 'clip';
  };
  return !(hides(doc.documentElement) ?? hides(doc.body) ?? false);
}

/** Units sized to the screen, with their small, large and dynamic forms; strings and url()s are matched only to be left alone. */
const SCREEN_UNITS = /url\([^)]*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?<![\w.])(\d*\.?\d+)[sld]?(vh|vb|vmin|vmax)\b/gi;

/** A style's text with each screen unit written as pixels at a width × height screen. */
export function screenPixels(text: string, width: number, height: number): string {
  const per: Record<string, number> = { vh: height / 100, vb: height / 100, vmin: Math.min(width, height) / 100, vmax: Math.max(width, height) / 100 };
  return text.replace(SCREEN_UNITS, (match, n: string | undefined, unit: string | undefined) =>
    n === undefined || unit === undefined ? match : `${Math.round(Number(n) * (per[unit.toLowerCase()] ?? 0) * 100) / 100}px`,
  );
}

/**
 * Holds the parts of a page sized to the screen (`100vh`, `50vmin`) at the
 * size's own screen, by writing those units as pixels in the styles of the
 * page as this frame shows it; the design file is untouched and nothing
 * runs in it. A frame drawn taller than its size then shows the page as that
 * screen shows it scrolled, instead of stretching a full-screen part and
 * pushing the rest of the page out of the frame.
 */
export function holdScreen(frame: HTMLIFrameElement, width: number, height: number): void {
  let doc: Document | null;
  try {
    doc = frame.contentDocument;
  } catch {
    return;
  }
  if (!doc) return;
  const hold = (style: CSSStyleDeclaration | undefined): void => {
    const text = style?.cssText;
    if (!style || !text) return;
    const held = screenPixels(text, width, height);
    if (held !== text) style.cssText = held;
  };
  const walk = (rules: CSSRuleList | undefined): void => {
    for (const rule of Array.from(rules ?? [])) {
      if ('style' in rule) hold(rule.style as CSSStyleDeclaration);
      if ('cssRules' in rule) walk(rule.cssRules as CSSRuleList);
      if ('styleSheet' in rule) walk(sheetRules(rule.styleSheet as CSSStyleSheet | null));
    }
  };
  for (const sheet of Array.from(doc.styleSheets ?? [])) walk(sheetRules(sheet));
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[style]'))) hold(el.style);
}

/** A style sheet's rules, or none when they cannot be read. */
function sheetRules(sheet: CSSStyleSheet | null): CSSRuleList | undefined {
  try {
    return sheet?.cssRules;
  } catch {
    return undefined;
  }
}

/**
 * The page's full height at its size, in CSS pixels: the document's height
 * with the frame at the size's own height, so a part sized to the screen
 * (`100vh`) counts as that screen shows it, whatever height the frame is
 * drawn at. Never below `height`, and exactly `height` for a page whose
 * window does not scroll. Null when the document cannot be read.
 */
export function pageHeight(frame: HTMLIFrameElement, height: number): number | null {
  let doc: Document | null;
  try {
    doc = frame.contentDocument;
  } catch {
    return null;
  }
  const root = doc?.documentElement;
  if (!doc || !root) return null;
  if (!scrolls(doc)) return height;
  const drawn = frame.style.height;
  frame.style.height = `${height}px`;
  try {
    return Math.max(height, root.scrollHeight, doc.body?.scrollHeight ?? 0);
  } finally {
    frame.style.height = drawn;
  }
}

/** Measures again once the page's fonts are ready, and whenever its document changes size (an image arriving). */
function follow(frame: HTMLIFrameElement, measure: () => void): void {
  let doc: Document | null;
  try {
    doc = frame.contentDocument;
  } catch {
    return;
  }
  if (!doc?.documentElement) return;
  void doc.fonts?.ready.then(measure, () => undefined);
  const Observer = (doc.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver;
  if (typeof Observer !== 'function' || typeof requestAnimationFrame !== 'function') return;
  let pending = 0;
  const observer = new Observer(() => {
    if (!frame.isConnected) {
      observer.disconnect();
      return;
    }
    // On the next frame, so growing the box never resizes the page inside its own observer.
    pending ||= requestAnimationFrame(() => {
      pending = 0;
      measure();
    });
  });
  observer.observe(doc.documentElement);
  if (doc.body) observer.observe(doc.body);
}

/** Frames shown at one height: the tallest of their pages, never below their size's height. */
export interface PageGroup {
  /** A box drawn at the group's height: `resize` runs now and whenever the height changes. */
  fit(resize: (height: number) => void): void;
  /** Forgets the boxes, before the group's frames are drawn again. */
  clear(): void;
  /** Wraps an iframe maker so each frame it makes measures its page, a page of `cell`. */
  frames(cell: Cell, make: () => HTMLIFrameElement): () => HTMLIFrameElement;
}

const keyOf = (cell: Pick<Cell, 'path' | 'root' | 'viewport'>): string => `${cell.root}:${cell.path}@${cell.viewport}`;

/**
 * The page heights measured during this visit, by frame, so frames drawn
 * again (another comparison mode, a size picked again, a frame reloaded)
 * start at the height already known instead of jumping.
 */
export class PageHeights {
  private readonly measured = new Map<string, number>();
  private readonly viewports: ReadonlyMap<string, Pick<Viewport, 'width' | 'height'>>;
  /** Applies a change of height; the preview keeps the reader's place around it. */
  private readonly steady: (change: () => void) => void;

  constructor(viewports: ReadonlyMap<string, Pick<Viewport, 'width' | 'height'>>, steady: (change: () => void) => void = (change) => change()) {
    this.viewports = viewports;
    this.steady = steady;
  }

  group(cells: Cell[]): PageGroup {
    const size = Math.max(1, ...cells.map((c) => this.viewports.get(c.viewport)?.height ?? 1));
    const keys = cells.map(keyOf);
    const boxes: ((height: number) => void)[] = [];
    const tallest = (): number => Math.max(size, ...keys.map((k) => this.measured.get(k) ?? 0));
    let shown = tallest();
    const update = (): void => {
      const next = tallest();
      if (next === shown) return;
      shown = next;
      this.steady(() => {
        for (const resize of boxes) resize(next);
      });
    };
    return {
      fit: (resize) => {
        boxes.push(resize);
        resize(shown);
      },
      clear: () => {
        boxes.length = 0;
      },
      frames: (cell, make) => () => {
        const frame = make();
        const key = keyOf(cell);
        const vp = this.viewports.get(cell.viewport) ?? { width: 1, height: size };
        const measure = (): void => {
          if (!frame.isConnected) return;
          const height = pageHeight(frame, vp.height);
          if (height === null) return;
          this.measured.set(key, height);
          update();
        };
        frame.addEventListener('load', () => {
          holdScreen(frame, vp.width, vp.height);
          measure();
          follow(frame, measure);
        });
        return frame;
      },
    };
  }
}
