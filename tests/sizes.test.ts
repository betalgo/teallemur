import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { parseHTML } from 'linkedom';
import type { Cell, Section, ViewerData, Viewport } from '../src/model.ts';
import { ownSizes } from '../src/sizes.ts';
import { Board } from '../src/viewer/board.ts';
import { Context } from '../src/viewer/context.ts';
import { openFocus } from '../src/viewer/focus.ts';
import { sidebar } from '../src/viewer/sidebar.ts';
import { MAX_SIZE_BUTTONS } from '../src/viewer/sizemenu.ts';
import { boardTopBar } from '../src/viewer/topbar.ts';
import { FIXTURES, PASS, cleanup, runCli, tempDir } from './helpers.ts';

after(cleanup);

const MEDIA = join(FIXTURES, 'media');

function viewerData(html: string): ViewerData {
  return JSON.parse(/<script type="application\/json" id="dv-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '') as ViewerData;
}

function slugOf(repo: string): string {
  return (JSON.parse(readFileSync(join(repo, 'design.json'), 'utf8')) as { slug: string }).slug;
}

/** Builds a repo and returns the board's data (or, with a base, the preview's and its full board's). */
function build(repo: string, extra: string[] = []): { dir: string; data: ViewerData } {
  const out = tempDir();
  const r = runCli(['build', repo, '--out', out, ...extra]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = join(out, slugOf(repo));
  return { dir, data: viewerData(readFileSync(join(dir, 'index.html'), 'utf8')) };
}

function copy(repo: string): string {
  const dir = join(tempDir(), 'repo');
  cpSync(repo, dir, { recursive: true });
  return dir;
}

function setPage(repo: string, page: string, edit: (html: string) => string): void {
  writeFileSync(join(repo, page), edit(readFileSync(join(repo, page), 'utf8')));
}

interface Dom {
  document: Document;
  window: Window & typeof globalThis;
  /** What has focus, as the element's focus() last set it. */
  active: () => Element | null;
}

function setGlobals(): Dom {
  const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(window, { location: { href: 'http://localhost/product/' } });
  Object.assign(globalThis, {
    document,
    window,
    localStorage: { getItem: () => null, setItem() {} },
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
    },
  });
  let active: Element | null = null;
  Object.defineProperty(document, 'activeElement', { get: () => active, configurable: true });
  window.HTMLElement.prototype.focus = function (this: HTMLElement) {
    active = this;
  };
  window.HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
    this.dataset.scrolled = 'yes';
  };
  return { document: document as unknown as Document, window: window as unknown as Window & typeof globalThis, active: () => active };
}

function mount(data: ViewerData): Dom & { ctx: Context; board: Board; bar: HTMLElement } {
  const dom = setGlobals();
  const ctx = new Context(data);
  const board = new Board(ctx, data.board);
  const bar = boardTopBar(ctx, () => board.found).el;
  dom.document.body.append(bar, board.el);
  board.render();
  return { ...dom, ctx, board, bar };
}

const frames = (board: Board): string[] => [...board.el.querySelectorAll<HTMLElement>('figure.dv-frame')].map((f) => `${f.dataset.path}@${f.dataset.viewport}`);
const cellsOf = (data: ViewerData): Cell[] => data.board.flatMap((s) => s.lines.flatMap((l) => l.cells));

function key(dom: Dom, target: EventTarget, name: string): void {
  target.dispatchEvent(Object.assign(new dom.window.Event('keydown', { bubbles: true, cancelable: true }), { key: name }));
}

const media = build(MEDIA).data;
const pass = build(PASS).data;

describe('boards of own sizes: the rule', () => {
  test('every screen page declaring one size of its own makes a board of own sizes; component and brand pages do not count', () => {
    assert.equal(ownSizes([]), false);
    assert.equal(ownSizes([{ kind: 'brand', ownSize: true }]), false);
    assert.equal(ownSizes([{ kind: 'screen', ownSize: true }, { kind: 'screen', ownSize: true }, { kind: 'component', ownSize: false }]), true);
    assert.equal(ownSizes([{ kind: 'screen', ownSize: true }, { kind: 'screen', ownSize: false }]), false);
  });

  test('the build marks a board whose every screen declares one size, and no other', () => {
    assert.equal(media.ownSizes, true);
    assert.equal(pass.ownSizes, undefined);
  });

  test('one screen with two sizes, or with none declared, makes it a board of one size at a time', () => {
    const page = 'screens/linkedin/company-logo--default.html';
    const two = copy(MEDIA);
    setPage(two, page, (html) => html.replace(/(name="design:viewports" content=")[^"]+/, '$1linkedin-company-logo,linkedin-feed-post'));
    assert.equal(build(two).data.ownSizes, undefined);
    const none = copy(MEDIA);
    setPage(none, page, (html) => html.replace(/<meta name="design:viewports"[^>]*>\n?/, ''));
    assert.equal(build(none).data.ownSizes, undefined);
  });

  test('a preview of a board of own sizes, and its full board, are marked too', () => {
    const base = copy(MEDIA);
    const head = copy(MEDIA);
    setPage(head, 'screens/linkedin/company-logo--default.html', (html) => html.replace('</main>', '<p>New</p></main>'));
    const { dir, data } = build(head, ['--base', base, '--label', 'PR 3: a new logo']);
    assert.equal(data.kind, 'preview');
    assert.equal(data.ownSizes, true);
    assert.equal(new Context(data).ownSizes, true);
    assert.equal(viewerData(readFileSync(join(dir, 'board', 'index.html'), 'utf8')).ownSizes, true);
    // A preview of a board of one size at a time is not.
    const passHead = copy(PASS);
    setPage(passHead, 'screens/auth/login--default.html', (html) => `${html}<!-- revised -->\n`);
    const one = build(passHead, ['--base', PASS]).data;
    assert.equal(one.ownSizes, undefined);
    assert.equal(new Context(one).ownSizes, false);
  });
});

describe('boards of own sizes: the board', () => {
  test('every page shows at once, once each, at its own size', () => {
    const { board } = mount(media);
    const pages = cellsOf(media).filter((c) => !c.path.startsWith('archive/'));
    const own = [...new Map(pages.map((c) => [c.path, c.viewports[0]])).entries()].map(([path, vp]) => `${path}@${vp}`);
    assert.ok(own.length > 1);
    assert.deepEqual(frames(board).sort(), own.sort());
    assert.equal(board.frames, own.length);
  });

  test('the top bar has no size control', () => {
    const { bar } = mount(media);
    assert.equal(bar.querySelector('.switcher, .size-menu, [data-viewport]'), null);
    // The board of one size at a time keeps its sizes.
    assert.ok(mount(pass).bar.querySelector('.switcher'));
  });

  test('a page with several sizes shows once, at its first; revealing it at another size shows that frame', () => {
    const brand: Cell[] = ['linkedin-company-logo', 'linkedin-feed-post'].map((vp) => ({
      path: 'design-system/brand/logo.html',
      root: 'head',
      viewport: vp,
      col: vp,
      label: `brand / logo · ${vp}`,
      title: 'Logo',
      viewports: ['linkedin-company-logo', 'linkedin-feed-post'],
    }));
    const board: Section[] = media.board.map((s) => (s.kind === 'design-system' ? { ...s, lines: [{ cells: brand }] } : s));
    const { ctx, board: b } = mount({ ...media, board });
    assert.deepEqual(frames(b).filter((f) => f.startsWith('design-system/')), [`${brand[0]!.path}@${brand[0]!.viewport}`]);
    ctx.setFilters({ query: 'zzz' });
    b.jump(brand[1]!);
    assert.equal(ctx.filters.query, '');
    assert.deepEqual(ctx.selected, { path: brand[0]!.path, root: 'head', viewport: brand[0]!.viewport });
    assert.equal(b.el.querySelectorAll('.dv-shot.is-selected').length, 1);
    assert.ok(frames(b).length > 1);
  });

  test('the sidebar reveals each state at its own size', () => {
    const dom = setGlobals();
    const ctx = new Context(media);
    const jumped: Cell[] = [];
    const nav = sidebar(ctx, (cell) => jumped.push(cell));
    dom.document.body.append(nav);
    const rows = [...nav.querySelectorAll<HTMLElement>('.tree-row--state')];
    assert.ok(rows.length > 1);
    for (const row of rows) row.click();
    assert.equal(jumped.length, rows.length);
    for (const c of jumped) assert.equal(c.viewport, c.viewports[0], c.path);
  });

  test('the focus view shows a one-size page at its size with no size control; a page with several sizes keeps them', () => {
    const dom = setGlobals();
    const ctx = new Context(media);
    const one = cellsOf(media).find((c) => c.path.startsWith('screens/'))!;
    let close = openFocus(ctx, one);
    const focus = dom.document.querySelector('.dv-focus')!;
    assert.equal(focus.querySelector('.switcher, .size-menu, .bottom-bar'), null);
    assert.equal(focus.querySelector<HTMLIFrameElement>('iframe.dv-focus-frame')?.getAttribute('width'), String(media.viewports.find((v) => v.id === one.viewport)?.width));
    close();
    const several: Cell = { ...one, viewports: [one.viewport, media.viewports.find((v) => v.id !== one.viewport)!.id] };
    close = openFocus(ctx, several);
    assert.ok(dom.document.querySelector('.dv-focus .top-bar .size-menu'));
    assert.ok(dom.document.querySelector('.dv-focus .bottom-bar .size-menu'));
    close();
  });
});

/** The passing fixture's board with sizes added until it has `n`. */
function withSizes(n: number): ViewerData {
  const extra: Viewport[] = [
    { id: 'wide', width: 1920, height: 1080 },
    { id: 'laptop', width: 1280, height: 800 },
    { id: 'small-phone', width: 360, height: 740 },
    { id: 'watch', width: 200, height: 240 },
  ];
  const viewports = [...pass.viewports, ...extra].slice(0, n);
  assert.equal(viewports.length, n);
  return { ...pass, viewports };
}

describe('the Size menu', () => {
  test('up to four sizes show as buttons, one per size', () => {
    for (const n of [3, MAX_SIZE_BUTTONS]) {
      const { bar } = mount(withSizes(n));
      assert.equal(bar.querySelectorAll('.switcher button[data-viewport]').length, n);
      assert.equal(bar.querySelector('.size-menu'), null);
    }
  });

  test('more than four fold into one Size menu: every size in design.json order, the current one checked, closed at first', () => {
    const data = withSizes(MAX_SIZE_BUTTONS + 2);
    const { ctx, bar } = mount(data);
    assert.equal(bar.querySelector('.switcher'), null);
    const menu = bar.querySelector('.size-menu.top-bar__center')!;
    assert.ok(menu);
    const button = menu.querySelector('.size-menu__button')!;
    assert.equal(button.getAttribute('aria-haspopup'), 'menu');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    const list = menu.querySelector<HTMLElement>('.size-menu__list')!;
    assert.equal(list.hidden, true);
    assert.equal(button.getAttribute('aria-controls'), list.id);
    const options = [...list.querySelectorAll('[role="menuitemradio"]')];
    assert.deepEqual(options.map((o) => o.getAttribute('data-viewport')), data.viewports.map((v) => v.id));
    assert.deepEqual(options.filter((o) => o.getAttribute('aria-checked') === 'true').map((o) => o.getAttribute('data-viewport')), [ctx.size]);
  });

  test('picking a size in the menu shows the board at that size and closes the menu', () => {
    const data = withSizes(6);
    const { ctx, board, bar } = mount(data);
    const button = bar.querySelector<HTMLButtonElement>('.size-menu__button')!;
    const list = bar.querySelector<HTMLElement>('.size-menu__list')!;
    button.click();
    assert.equal(list.hidden, false);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    const other = data.viewports.find((v) => v.id !== ctx.size && cellsOf(data).some((c) => c.viewport === v.id))!;
    list.querySelector<HTMLButtonElement>(`[data-viewport="${other.id}"]`)!.click();
    assert.equal(ctx.size, other.id);
    assert.equal(list.hidden, true);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.deepEqual([...list.querySelectorAll('[aria-checked="true"]')].map((o) => o.getAttribute('data-viewport')), [other.id]);
    assert.ok(frames(board).length > 0);
    assert.ok(frames(board).every((f) => f.endsWith(`@${other.id}`)));
  });

  test('the keyboard opens the menu on the current size, moves through it, and Escape closes it back on the button', () => {
    const data = withSizes(6);
    const dom = mount(data);
    const button = dom.bar.querySelector<HTMLButtonElement>('.size-menu__button')!;
    const list = dom.bar.querySelector<HTMLElement>('.size-menu__list')!;
    const ids = data.viewports.map((v) => v.id);
    const at = (): string | null | undefined => dom.active()?.getAttribute('data-viewport');
    key(dom, button, 'ArrowDown');
    assert.equal(list.hidden, false);
    assert.equal(at(), dom.ctx.size);
    const start = ids.indexOf(dom.ctx.size);
    key(dom, list, 'ArrowDown');
    assert.equal(at(), ids[(start + 1) % ids.length]);
    key(dom, list, 'End');
    assert.equal(at(), ids[ids.length - 1]);
    key(dom, list, 'ArrowDown');
    assert.equal(at(), ids[0]);
    key(dom, list, 'ArrowUp');
    assert.equal(at(), ids[ids.length - 1]);
    key(dom, list, 'Home');
    assert.equal(at(), ids[0]);
    key(dom, list, 'Escape');
    assert.equal(list.hidden, true);
    assert.equal(dom.active(), button);
  });

  test('a click outside the menu closes it', () => {
    const dom = mount(withSizes(6));
    const list = dom.bar.querySelector<HTMLElement>('.size-menu__list')!;
    dom.bar.querySelector<HTMLButtonElement>('.size-menu__button')!.click();
    assert.equal(list.hidden, false);
    list.querySelector('button')!.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    assert.equal(list.hidden, false);
    dom.board.el.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    assert.equal(list.hidden, true);
  });

  test('in the focus view, more than four sizes are a menu in the top bar and the bottom bar, with sizes the page does not offer greyed out', () => {
    const data = withSizes(6);
    const dom = setGlobals();
    const ctx = new Context(data);
    const opened: Cell[] = [];
    ctx.focus = (cell) => opened.push(cell);
    const cell = cellsOf(data).find((c) => c.path.startsWith('screens/') && c.viewports.length >= 2)!;
    const close = openFocus(ctx, cell);
    const menus = [...dom.document.querySelectorAll('.dv-focus .size-menu')];
    assert.equal(menus.length, 2);
    assert.equal(dom.document.querySelector('.dv-focus .switcher'), null);
    for (const menu of menus) {
      const options = [...menu.querySelectorAll<HTMLButtonElement>('.size-menu__option')];
      assert.deepEqual(options.map((o) => o.getAttribute('data-viewport')), data.viewports.map((v) => v.id));
      assert.deepEqual(options.filter((o) => !o.disabled).map((o) => o.getAttribute('data-viewport')), cell.viewports);
    }
    const other = cell.viewports.find((v) => v !== cell.viewport)!;
    menus[0]!.querySelector<HTMLButtonElement>('.size-menu__button')!.click();
    menus[0]!.querySelector<HTMLButtonElement>(`[data-viewport="${other}"]`)!.click();
    assert.deepEqual(opened.map((c) => `${c.path}@${c.viewport}`), [`${cell.path}@${other}`]);
    close();
  });

  test('in the focus view, arrow keys in the open menu move through it instead of stepping screens', () => {
    const data = withSizes(6);
    const dom = setGlobals();
    const ctx = new Context(data);
    const opened: Cell[] = [];
    ctx.focus = (cell) => opened.push(cell);
    const cell = cellsOf(data).find((c) => c.path.startsWith('screens/') && c.viewports.length >= 2)!;
    const close = openFocus(ctx, cell);
    const menu = dom.document.querySelector('.dv-focus .top-bar .size-menu')!;
    const list = menu.querySelector<HTMLElement>('.size-menu__list')!;
    menu.querySelector<HTMLButtonElement>('.size-menu__button')!.click();
    for (const k of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'v']) key(dom, list, k);
    assert.deepEqual(opened, []);
    assert.equal(list.hidden, false);
    close();
  });
});
