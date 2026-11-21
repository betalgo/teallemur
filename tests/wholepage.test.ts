import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseHTML } from 'linkedom';
import type { Cell, Line, Section, ViewerData } from '../src/model.ts';
import { Context } from '../src/viewer/context.ts';
import { openFocus } from '../src/viewer/focus.ts';
import { frameElement } from '../src/viewer/frame.ts';
import { FrameLoader } from '../src/viewer/loader.ts';
import { mountPreview } from '../src/viewer/preview.ts';
import { holdScreen, pageHeight, screenPixels } from '../src/viewer/wholepage.ts';

// Previews show each change's whole page. Frames load in a DOM
// without layout, so each test hands every frame a stand-in for its design
// page: how tall the document is with the frame at a given height.

const viewports = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'phone', width: 390, height: 844 },
];
const LONG = 'screens/home/landing--default.html';
const SHORT = 'screens/auth/login--default.html';
const APP = 'screens/inbox/list--default.html';
const ADDED = 'screens/settings/billing--default.html';
const option = (id: string): string => `explorations/2026-11-01-home/${id}/screens/home/landing--default.html`;

const cell = (path: string, root: Cell['root'], viewport: string, col = viewport): Cell => ({ path, root, viewport, col, label: `${path} · ${viewport}`, title: path, viewports: viewports.map((v) => v.id) });

function previewData(changed: string[], added: string[] = [], options: string[] = []): ViewerData {
  const pairs: Line[] = changed.flatMap((p) => viewports.map((v) => ({ cells: [cell(p, 'base', v.id), cell(p, 'head', v.id)] })));
  const sections: Section[] = [{ id: 'changed', kind: 'changed', title: '', align: false, columns: [], lines: pairs }];
  if (added.length > 0) sections.push({ id: 'added', kind: 'added', title: '', align: false, columns: [], lines: added.flatMap((p) => viewports.map((v) => ({ cells: [cell(p, 'head', v.id)] }))) });
  if (options.length > 0) {
    sections.push({ id: 'home', kind: 'exploration', title: '2026-11-01-home', align: true, columns: options, lines: viewports.map((v) => ({ cells: options.map((o) => cell(option(o), 'head', v.id, o)) })) });
  }
  return { kind: 'preview', product: { name: 'Example', slug: 'example' }, commit: null, viewports, flows: [], roots: { head: '', base: '_base/' }, board: [], preview: { label: null, base: null, boardHref: 'board/', shared: null, sections } };
}

/**
 * A design page: `height` tall at its size. `screen`: it starts with a part
 * at least the screen high (`min-height: 100vh`), so while that rule holds a
 * taller frame makes the page taller still. `overflow`: its body's overflow,
 * `hidden` for a page whose window does not scroll.
 */
interface Page { height: number; screen?: boolean; overflow?: string; fonts?: Promise<unknown> }

/** The frame's height: set on the frame itself, else its box's. */
const drawn = (frame: HTMLIFrameElement, size: number): number => parseFloat(frame.style.height) || parseFloat((frame.parentElement as HTMLElement | null)?.style.height ?? '') || size;

function doc(frame: HTMLIFrameElement, size: number, page: Page): object {
  const body = { scrollHeight: 0 };
  const hero = { style: { cssText: 'min-height: 100vh;' } };
  return {
    documentElement: {
      get scrollHeight() {
        const at = drawn(frame, size);
        const stretched = page.screen && hero.style.cssText.includes('vh');
        return Math.max(at, page.height + (stretched ? at - size : 0));
      },
    },
    body,
    styleSheets: page.screen ? [{ cssRules: [hero] }] : [],
    querySelectorAll: () => [],
    defaultView: { getComputedStyle: (el: object) => ({ overflowY: el === body ? (page.overflow ?? 'visible') : 'visible' }) },
    fonts: { ready: page.fonts ?? Promise.resolve() },
  };
}

/** Loads a frame with a page. */
function load(frame: HTMLIFrameElement, page: Page): void {
  const size = Number(frame.getAttribute('height'));
  const d = doc(frame, size, page);
  Object.defineProperty(frame, 'contentDocument', { configurable: true, get: () => d });
  frame.dispatchEvent(new window.Event('load'));
}

/** Loads every frame not loaded yet; `pages` gives each frame's page by its src and size. */
function loadAll(app: HTMLElement, pages: (src: string, size: number) => Page): void {
  for (const f of app.querySelectorAll<HTMLIFrameElement>('iframe')) {
    if (!f.contentDocument) load(f, pages(f.getAttribute('src') ?? '', Number(f.getAttribute('height'))));
  }
}

/** The height a box is drawn at, from its proportions. */
const tall = (el: Element): number => Number((el as HTMLElement).style.getPropertyValue('aspect-ratio').split('/')[1]);
const pair = (app: HTMLElement, path: string): HTMLElement => app.querySelector<HTMLElement>(`.dv-comparison[data-path="${path}"]`)!;
const shots = (el: Element): number[] => [...el.querySelectorAll('.dv-shot')].map(tall);

interface Layout {
  y: number;
  moves: number[];
  revealed: HTMLElement[];
}

/**
 * A DOM in which every frame loads as soon as it is drawn. With `layout`,
 * the page also has a simple layout: frames 600 px wide, one row each
 * (before and after side by side), 100 px apart from 100 px down, under a
 * 60 px top bar in a 900 px window, scrolled by `y`.
 */
function dom(layout = false): { document: Document; at: Layout } {
  const { document, window } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  Object.assign(window, { location: { href: 'http://localhost/example/', hash: '' }, history: { pushState() {} } });
  Object.assign(globalThis, {
    document,
    window,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    IntersectionObserver: class {
      private readonly seen: (entries: { target: Element; isIntersecting: boolean }[]) => void;
      constructor(seen: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
        this.seen = seen;
      }
      observe(target: Element) {
        this.seen([{ target, isIntersecting: true }]);
      }
      unobserve() {}
    },
    CSS: { supports: () => false },
  });
  const at: Layout = { y: 0, moves: [], revealed: [] };
  const W = 600;
  const rect = (top: number, height: number) => ({ top: top - at.y, bottom: top - at.y + height, height, left: 0, right: W, width: W, x: 0, y: top - at.y });
  window.HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.tagName === 'HEADER') return { top: 0, bottom: 60, height: 60, left: 0, right: W, width: W, x: 0, y: 0 } as DOMRect;
    const own = this.closest('.dv-shot');
    const mine = own ? [own] : [...this.querySelectorAll('.dv-shot')];
    let y = 100;
    let top = Infinity;
    let bottom = -Infinity;
    let row: Element | null = null;
    let rowHeight = 0;
    for (const shot of document.querySelectorAll('.dv-shot')) {
      const together = shot.closest('.compare-pair');
      if (!(together && together === row)) {
        y += rowHeight > 0 ? rowHeight + 100 : 0;
        rowHeight = 0;
      }
      row = together;
      const [w, h] = (shot as HTMLElement).style.getPropertyValue('aspect-ratio').split('/').map(Number) as [number, number];
      const height = (W * h) / w;
      rowHeight = Math.max(rowHeight, height);
      if (mine.includes(shot)) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + height);
      }
    }
    return (mine.length > 0 ? rect(top, bottom - top) : rect(0, 0)) as DOMRect;
  };
  window.HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
    at.revealed.push(this);
  };
  window.HTMLElement.prototype.focus = () => undefined;
  if (layout) Object.assign(window, { innerHeight: 900, scrollBy: (_x: number, y: number) => { at.y += y; at.moves.push(y); } });
  return { document: document as unknown as Document, at };
}

/** Mounts a preview in a DOM from dom(). */
function mount(data: ViewerData, layout = false): { app: HTMLElement; ctx: Context; at: Layout } {
  const { document, at } = dom(layout);
  const ctx = new Context(data);
  const app = document.getElementById('app')!;
  mountPreview(ctx, app);
  return { app, ctx, at };
}

describe('a page\'s full height at its size', () => {
  const frame = (page: Page | null, size = 900, drawnAt = ''): HTMLIFrameElement => {
    const f = { style: { height: drawnAt } } as unknown as HTMLIFrameElement;
    Object.defineProperty(f, 'contentDocument', { get: () => (page ? doc(f, size, page) : null) });
    return f;
  };

  test('is the document\'s height, measured with the frame at the size\'s height whatever it is drawn at', () => {
    const f = frame({ height: 3600, screen: true }, 900, '3600px');
    assert.equal(pageHeight(f, 900), 3600);
    // The height it was drawn at is put back.
    assert.equal(f.style.height, '3600px');
  });

  test('is the size\'s height for a page that fits it, scrolls inside its own areas, or does not scroll', () => {
    assert.equal(pageHeight(frame({ height: 600 }), 900), 900);
    assert.equal(pageHeight(frame({ height: 900 }), 900), 900);
    assert.equal(pageHeight(frame({ height: 2400, overflow: 'hidden' }), 900), 900);
  });

  test('is unknown while the document cannot be read', () => {
    assert.equal(pageHeight(frame(null), 900), null);
    const elsewhere = { style: { height: '' } } as unknown as HTMLIFrameElement;
    Object.defineProperty(elsewhere, 'contentDocument', { get: () => { throw new Error('another origin'); } });
    assert.equal(pageHeight(elsewhere, 900), null);
  });
});

describe('parts sized to the screen keep the size\'s screen', () => {
  test('screen units become pixels at the size; strings, urls and widths stay', () => {
    const at = (text: string): string => screenPixels(text, 1440, 900);
    assert.equal(at('min-height: 100vh; width: 50vw;'), 'min-height: 900px; width: 50vw;');
    assert.equal(at('height: calc(100dvh - 60px); top: -10svh; --hero: 100lvh;'), 'height: calc(900px - 60px); top: -90px; --hero: 900px;');
    assert.equal(at('padding: 2vmin 1vmax 0.5vb;'), 'padding: 18px 14.4px 4.5px;');
    assert.equal(at('content: "100vh"; background: url("a-100vh.png");'), 'content: "100vh"; background: url("a-100vh.png");');
  });

  test('every rule of the page as the frame shows it, nested and imported, and its inline styles', () => {
    const style = (cssText: string): { cssText: string } => ({ cssText });
    const top = style('min-height: 100vh;');
    const nested = style('height: 50vh;');
    const imported = style('max-height: 80vh;');
    const inline = style('height: 100vh;');
    const unread = { get cssRules(): never { throw new Error('another origin'); } };
    const page = {
      styleSheets: [{ cssRules: [{ style: top }, { cssRules: [{ style: nested }] }, { styleSheet: { cssRules: [{ style: imported }] } }] }, unread],
      querySelectorAll: () => [{ style: inline }],
    };
    const f = { contentDocument: page } as unknown as HTMLIFrameElement;
    holdScreen(f, 390, 844);
    assert.deepEqual([top, nested, imported, inline].map((s) => s.cssText), ['min-height: 844px;', 'height: 422px;', 'max-height: 675.2px;', 'height: 844px;']);
  });
});

describe('previews show each change\'s whole page', () => {
  const pages = (src: string, size: number): Page => {
    if (src === `_base/${LONG}`) return { height: size === 900 ? 2700 : 4000 };
    if (src === LONG) return { height: size === 900 ? 3600 : 5200, screen: true };
    if (src.endsWith(SHORT)) return { height: 600 };
    if (src.endsWith(APP)) return { height: 2400, overflow: 'hidden' };
    if (src === ADDED) return { height: 2000 };
    if (src === option('a')) return { height: 1800 };
    if (src === option('b')) return { height: 2600 };
    return { height: size };
  };

  test('before and after keep the size\'s height until they load, then both grow to the taller page', () => {
    const { app, ctx } = mount(previewData([LONG]));
    const change = pair(app, LONG);
    assert.deepEqual(shots(change), [900, 900]);
    // Before loads first: both sides grow to it at once.
    load(change.querySelector<HTMLIFrameElement>('.compare-side[data-root="base"] iframe')!, pages(`_base/${LONG}`, 900));
    assert.deepEqual(shots(change), [2700, 2700]);
    loadAll(app, pages);
    assert.deepEqual(shots(change), [3600, 3600]);
    assert.deepEqual([...change.querySelectorAll<HTMLElement>('.dv-view')].map((v) => v.style.height), ['3600px', '3600px']);
    // Side by side, before then after, and a click still opens the focus view.
    assert.deepEqual([...change.querySelectorAll('.dv-frame')].map((f) => f.getAttribute('data-root')), ['base', 'head']);
    const opened: Cell[] = [];
    ctx.focus = (c) => { opened.push(c); };
    change.querySelector<HTMLButtonElement>('.compare-side[data-root="head"] .dv-frame-open')!.click();
    assert.deepEqual(opened.map((c) => [c.root, c.path]), [['head', LONG]]);
  });

  test('a part sized to the screen stays the screen high, so the whole page fits its frame and stays that height', () => {
    const { app } = mount(previewData([LONG]));
    loadAll(app, pages);
    const after = pair(app, LONG).querySelector<HTMLIFrameElement>('.compare-side[data-root="head"] iframe')!;
    const page = after.contentDocument as unknown as { documentElement: { scrollHeight: number } };
    // Drawn 3600 high, the page is 3600 high: nothing is pushed out at the bottom.
    assert.equal(drawn(after, 900), 3600);
    assert.equal(page.documentElement.scrollHeight, 3600);
    for (const f of pair(app, LONG).querySelectorAll('iframe')) f.dispatchEvent(new window.Event('load'));
    assert.deepEqual(shots(pair(app, LONG)), [3600, 3600]);
  });

  test('a page that fits its size, or does not scroll, keeps the size\'s height', () => {
    const { app } = mount(previewData([SHORT, APP]));
    loadAll(app, pages);
    assert.deepEqual(shots(pair(app, SHORT)), [900, 900]);
    assert.deepEqual(shots(pair(app, APP)), [900, 900]);
  });

  test('the overlay draws both layers at the pair\'s height, and the modes swap without shrinking', () => {
    const { app } = mount(previewData([LONG]));
    loadAll(app, pages);
    const change = pair(app, LONG);
    change.querySelectorAll<HTMLButtonElement>('.switcher button')[1]!.click();
    // Before the new frames load: the height already measured.
    const stage = change.querySelector<HTMLElement>('.dv-overlay')!;
    assert.equal(tall(stage), 3600);
    const layers = [...change.querySelectorAll<HTMLElement>('.dv-compare-layer')];
    assert.deepEqual(layers.map((l) => l.style.height), ['3600px', '3600px']);
    loadAll(app, pages);
    assert.equal(tall(stage), 3600);
    const range = change.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '25';
    range.dispatchEvent(new window.Event('input'));
    assert.equal(layers[1]!.style.clipPath, 'inset(0 75% 0 0)');
    change.querySelectorAll<HTMLButtonElement>('.switcher button')[0]!.click();
    assert.deepEqual(shots(change), [3600, 3600]);
  });

  test('added pages and options each show their own whole page', () => {
    const { app } = mount(previewData([SHORT], [ADDED], ['a', 'b']));
    loadAll(app, pages);
    assert.deepEqual(shots(app.querySelector('.dv-added')!), [2000]);
    assert.deepEqual(shots(app.querySelector('.option-set')!), [1800, 2600]);
  });

  test('picking another size measures again at that size, and the size picked before comes back at its height', () => {
    const { app } = mount(previewData([LONG]));
    loadAll(app, pages);
    app.querySelector<HTMLButtonElement>('header .switcher button[data-viewport="phone"]')!.click();
    const atPhone = pair(app, LONG);
    assert.equal(atPhone.dataset.viewport, 'phone');
    assert.deepEqual(shots(atPhone), [844, 844]);
    loadAll(app, pages);
    assert.deepEqual(shots(pair(app, LONG)), [5200, 5200]);
    app.querySelector<HTMLButtonElement>('header .switcher button[data-viewport="desktop"]')!.click();
    assert.deepEqual(shots(pair(app, LONG)), [3600, 3600]);
  });

  test('fonts arriving after the page loads are measured', async () => {
    let ready: () => void = () => undefined;
    const page: Page = { height: 1200, fonts: new Promise<void>((resolve) => { ready = resolve; }) };
    const { app } = mount(previewData([], [ADDED]));
    load(app.querySelector<HTMLIFrameElement>('.dv-added iframe')!, page);
    assert.deepEqual(shots(app.querySelector('.dv-added')!), [1200]);
    page.height = 1500;
    ready();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(shots(app.querySelector('.dv-added')!), [1500]);
  });

  test('board frames still show their size\'s first screen', () => {
    const { document } = dom();
    const ctx = new Context({ ...previewData([LONG]), kind: 'board' });
    const figure = frameElement(ctx, cell(LONG, 'head', 'desktop'), new FrameLoader(null, '50% 0px'));
    document.body.append(figure);
    load(figure.querySelector('iframe')!, { height: 3600 });
    assert.deepEqual(shots(figure), [900]);
  });
});

describe('whole pages keep the reader\'s place', () => {
  const pages = (): Page => ({ height: 3600 });
  const LATER = 'screens/home/pricing--default.html';

  test('frames growing above the change being read do not move it', () => {
    const { app, at } = mount(previewData([LONG, LATER]), true);
    // Rows at 600 px wide: 375 px each at 1440 × 900. The second change is being read.
    at.y = 400;
    const read = pair(app, LATER).querySelector<HTMLElement>('.dv-shot')!;
    assert.equal(read.getBoundingClientRect().top, 175);
    for (const f of pair(app, LONG).querySelectorAll<HTMLIFrameElement>('iframe')) load(f, pages());
    assert.equal(read.getBoundingClientRect().top, 175);
    assert.equal(at.moves.reduce((a, b) => a + b, 0), 1125);
    // The change being read growing itself moves nothing.
    const moves = at.moves.length;
    for (const f of pair(app, LATER).querySelectorAll<HTMLIFrameElement>('iframe')) load(f, pages());
    assert.equal(at.moves.length, moves);
    assert.equal(read.getBoundingClientRect().top, 175);
  });

  test('revealing a whole page already on screen leaves it where it is; one off screen comes in under the top bar', () => {
    const { app, ctx, at } = mount(previewData([LONG, LATER]), true);
    loadAll(app, pages);
    const later = pair(app, LATER).querySelector<HTMLElement>('.compare-side[data-root="head"]')!;
    at.y = later.getBoundingClientRect().top + at.y - 200;
    // Coming back from the focus view on the page being read.
    ctx.jump(cell(LATER, 'head', 'desktop'));
    assert.equal(later.getBoundingClientRect().top, 200);
    assert.deepEqual(at.revealed, []);
    at.y = 20000;
    ctx.jump(cell(LONG, 'base', 'desktop'));
    assert.equal(pair(app, LONG).querySelector<HTMLElement>('.dv-shot')!.getBoundingClientRect().top, 76);
  });

  test('picking a size while reading inside a whole page keeps the same share of that change on the reading line', () => {
    const { app, at } = mount(previewData([LONG, LATER]), true);
    loadAll(app, pages);
    // Reading the later change 770 px into its 1500 px: the reading line is 270 px down.
    at.y = pair(app, LATER).getBoundingClientRect().top + at.y + 500;
    const share = (270 - pair(app, LATER).getBoundingClientRect().top) / pair(app, LATER).getBoundingClientRect().height;
    app.querySelector<HTMLButtonElement>('header .switcher button[data-viewport="phone"]')!.click();
    const box = pair(app, LATER).getBoundingClientRect();
    assert.equal(pair(app, LATER).dataset.viewport, 'phone');
    assert.ok(Math.abs((270 - box.top) / box.height - share) < 1e-9, `${(270 - box.top) / box.height} vs ${share}`);
  });
});

test('the focus view\'s Full height measures the page as previews do, so it does not grow each time', () => {
  const { document, window } = parseHTML('<html><body></body></html>');
  Object.assign(window, { location: { href: 'http://localhost/example/' } });
  window.HTMLElement.prototype.focus = () => undefined;
  Object.assign(globalThis, { document, window });
  const data = previewData([LONG]);
  const ctx = new Context({ ...data, kind: 'board' });
  ctx.focusFullHeight = true;
  const close = openFocus(ctx, cell(LONG, 'head', 'desktop'));
  const frame = document.querySelector<HTMLIFrameElement>('.dv-focus-frame')!;
  load(frame, { height: 3600, screen: true });
  assert.equal(frame.style.height, '3600px');
  frame.dispatchEvent(new window.Event('load'));
  frame.dispatchEvent(new window.Event('load'));
  assert.equal(frame.style.height, '3600px');
  close();
});
