import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { parseHTML } from 'linkedom';
import type { Cell, Line, ViewerData, Viewport } from '../src/model.ts';
import { STORAGE_PREFIX } from '../src/product.ts';
import { previewOpeningSize } from '../src/sizes.ts';
import { Context } from '../src/viewer/context.ts';
import { linesAtSize, previewSize } from '../src/viewer/filters.ts';
import { mountPreview } from '../src/viewer/preview.ts';
import { frameHash, mountRoutes } from '../src/viewer/routes.ts';
import { FIXTURES, PASS, cleanup, runCli, tempDir } from './helpers.ts';

after(cleanup);

function viewerData(file: string): ViewerData {
  return JSON.parse(/<script type="application\/json" id="dv-data">([\s\S]*?)<\/script>/.exec(readFileSync(file, 'utf8'))?.[1] ?? '') as ViewerData;
}

function edit(repo: string, page: string, change: (html: string) => string): void {
  writeFileSync(join(repo, page), change(readFileSync(join(repo, page), 'utf8')));
}

const sizes = (repo: string, ids: string): void => edit(repo, 'screens/settings/profile--default.html', (html) => html.replace('</title>', `</title>\n<meta name="design:viewports" content="${ids}">`));

// Five sizes, desktop not the first, and a changed page that has no desktop.
const viewports: Viewport[] = [
  { id: 'wide', width: 1920, height: 1080 },
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'tablet-portrait', width: 768, height: 1024 },
  { id: 'phone', width: 390, height: 844 },
  { id: 'small-phone', width: 360, height: 740 },
];
const base = join(tempDir(), 'base');
cpSync(PASS, base, { recursive: true });
const designFile = join(base, 'design.json');
writeFileSync(designFile, JSON.stringify({ ...JSON.parse(readFileSync(designFile, 'utf8')), viewports }, null, 2));
sizes(base, 'tablet-portrait, phone');
const head = join(tempDir(), 'head');
cpSync(base, head, { recursive: true });
const changed = ['screens/auth/login--default.html', 'screens/auth/login--error.html', 'screens/auth/signup--default.html', 'screens/settings/profile--default.html'];
for (const page of changed) edit(head, page, (html) => `${html}<!-- revised -->\n`);
const addedEverywhere = 'screens/settings/billing--default.html';
const addedPhone = 'screens/settings/notifications--default.html';
cpSync(join(head, 'screens/auth/signup--default.html'), join(head, addedEverywhere));
cpSync(join(head, 'screens/auth/signup--default.html'), join(head, addedPhone));
edit(head, addedEverywhere, (html) => html.replace('<main>', '<main><p>Billing</p>'));
edit(head, addedPhone, (html) => html.replace('</title>', '</title>\n<meta name="design:viewports" content="phone">').replace('<main>', '<main><p>Notifications</p>'));
for (const option of ['a', 'b']) edit(head, `explorations/2026-01-15-onboarding/${option}/screens/auth/welcome--default.html`, (html) => `${html}<!-- revised -->\n`);

const out = tempDir();
const built = runCli(['build', head, '--out', out, '--base', base, '--label', 'PR 9: sign in']);
const slug = (JSON.parse(readFileSync(designFile, 'utf8')) as { slug: string }).slug;
const data = (): ViewerData => viewerData(join(out, slug, 'index.html'));

interface Page {
  ctx: Context;
  app: HTMLElement;
  stored: Map<string, string>;
  window: Window & typeof globalThis;
}

/** Mounts the preview with a DOM and a local storage holding `stored`; `blocked` makes storage throw. */
function open(viewerData: ViewerData, stored: Record<string, string> = {}, blocked = false): Page {
  const { document, window } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  Object.assign(window, { location: { href: `http://localhost/${slug}/`, hash: '' }, history: { pushState() {} } });
  const store = new Map(Object.entries(stored));
  const localStorage = {
    getItem: (k: string) => {
      if (blocked) throw new Error('blocked');
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (blocked) throw new Error('blocked');
      store.set(k, v);
    },
  };
  Object.assign(globalThis, {
    document,
    window,
    localStorage,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
    },
    CSS: { supports: () => false },
  });
  window.HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
    this.dataset.scrolled = 'yes';
  };
  window.HTMLElement.prototype.focus = () => undefined;
  const ctx = new Context(viewerData);
  const app = document.getElementById('app') as unknown as HTMLElement;
  mountPreview(ctx, app);
  return { ctx, app, stored: store, window: window as unknown as Window & typeof globalThis };
}

const KEY = `${STORAGE_PREFIX}:size:${slug}`;
/** "path@viewport" of each change, added page and option frame, in page order. */
const changes = (app: HTMLElement): string[] => [...app.querySelectorAll<HTMLElement>('.dv-comparison')].map((el) => `${el.dataset.path}@${el.dataset.viewport}`);
const addedFrames = (app: HTMLElement): string[] => [...app.querySelectorAll<HTMLElement>('.dv-added > .dv-frame')].map((el) => `${el.dataset.path}@${el.dataset.viewport}`);
const optionFrames = (app: HTMLElement): string[] => [...app.querySelectorAll<HTMLElement>('.option-set .dv-frame')].map((el) => `${el.dataset.path}@${el.dataset.viewport}`);
const meta = (app: HTMLElement, kind: string): string => app.querySelector(`[data-kind="${kind}"] .section-head__meta`)?.textContent ?? '';

/** Where each page shows when `size` is picked: there, or at its own first size when it does not have it. */
function expected(cells: Cell[], size: string): string[] {
  const seen = new Map<string, string>();
  for (const c of cells) if (!seen.has(c.path)) seen.set(c.path, c.viewports.includes(size) ? size : (c.viewports[0] ?? ''));
  return [...seen].map(([path, vp]) => `${path}@${vp}`);
}

const pick = (page: Page, id: string): void => {
  page.app.querySelector<HTMLButtonElement>('header .size-menu__button')!.click();
  page.app.querySelector<HTMLButtonElement>(`header .size-menu__option[data-viewport="${id}"]`)!.click();
};

describe('previews: one size at a time', () => {
  test('the build succeeds, with every size of every change in the data', () => {
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const lines = data().preview!.sections.find((s) => s.kind === 'changed')!.lines;
    // Before and after at each size a page offers: 5 + 2 + 5 + 2 pairs.
    assert.equal(lines.length, 14);
  });

  test('it opens at desktop, though desktop is not the first size, with one pair per changed page', () => {
    const { ctx, app } = open(data());
    assert.equal(ctx.size, 'desktop');
    const changedCells = data().preview!.sections.find((s) => s.kind === 'changed')!.lines.flatMap((l) => l.cells);
    assert.deepEqual(changes(app), expected(changedCells, 'desktop'));
    assert.equal(changes(app).length, changed.length);
    // The page without desktop shows at its own first size.
    assert.ok(changes(app).includes('screens/settings/profile--default.html@tablet-portrait'));
    // Each change still pairs before and after.
    for (const el of app.querySelectorAll('.dv-comparison')) {
      assert.deepEqual([...el.querySelectorAll('.dv-frame')].map((f) => f.getAttribute('data-root')), ['base', 'head']);
    }
  });

  test('added pages and options show once each at that size too; a page without it at its own first size', () => {
    const { app } = open(data());
    assert.deepEqual(addedFrames(app), [`${addedEverywhere}@desktop`, `${addedPhone}@phone`]);
    const options = optionFrames(app);
    assert.equal(options.length, 2);
    assert.ok(options.every((f) => f.endsWith('@desktop')));
    // Options sit side by side in columns sized for the size shown, like added pages.
    for (const grid of app.querySelectorAll<HTMLElement>('.option-set .dv-grid, .dv-added')) assert.match(grid.style.getPropertyValue('--dv-min'), /^\d+(\.\d+)?px$/);
  });

  test('a frame shown at its own size is labelled with that size', () => {
    const { app } = open(data());
    const profile = app.querySelector('.dv-comparison[data-path="screens/settings/profile--default.html"]')!;
    assert.match(profile.querySelector('.change__head .frame__label')?.textContent ?? '', /tablet-portrait/);
    const phoneOnly = app.querySelector(`.dv-added > .dv-frame[data-path="${addedPhone}"]`)!;
    assert.match(phoneOnly.querySelector('.frame__label')?.textContent ?? '', /phone/);
  });

  test('more than four sizes are the board\'s Size menu, centred in the top bar, with desktop checked', () => {
    const { app } = open(data());
    const bar = app.querySelector('header')!;
    assert.ok(bar.classList.contains('top-bar--board'));
    assert.ok(bar.classList.contains('top-bar--centered'));
    const menu = bar.querySelector('.size-menu.top-bar__center')!;
    assert.ok(menu);
    assert.deepEqual([...menu.querySelectorAll('[role="menuitemradio"]')].map((o) => o.getAttribute('data-viewport')), viewports.map((v) => v.id));
    assert.deepEqual([...menu.querySelectorAll('[aria-checked="true"]')].map((o) => o.getAttribute('data-viewport')), ['desktop']);
    // The full board stays one link away.
    assert.ok(bar.querySelector('.top-bar__end a.dv-board-link'));
  });

  test('a preview with no changed or added pages, only shared files, has no size control', () => {
    const d = data();
    d.preview!.sections = d.preview!.sections.filter((s) => s.kind === 'archived');
    d.preview!.shared = { files: ['design-system/tokens.css'], tokens: [] };
    const { app } = open(d);
    assert.ok(!app.querySelector('header .switcher, header .size-menu, header [data-viewport]'));
    assert.ok(app.querySelector('header a.dv-board-link'));
  });

  test('up to four sizes are buttons, as on the board', () => {
    const four = { ...data(), viewports: viewports.slice(0, 4) };
    const { app } = open(four);
    const buttons = [...app.querySelectorAll('header .switcher.top-bar__center button[data-viewport]')];
    assert.deepEqual(buttons.map((b) => b.getAttribute('data-viewport')), four.viewports.map((v) => v.id));
    assert.deepEqual(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-viewport')), ['desktop']);
    assert.equal(app.querySelector('header .size-menu'), null);
  });

  test('picking a size switches every change, added page and option at once, for this visit only', () => {
    const page = open(data());
    const all = data().preview!.sections.flatMap((s) => (s.kind === 'archived' ? [] : s.lines.flatMap((l) => l.cells)));
    for (const id of ['phone', 'wide', 'small-phone']) {
      pick(page, id);
      assert.equal(page.ctx.size, id);
      const changedCells = all.filter((c) => changed.includes(c.path));
      assert.deepEqual(changes(page.app), expected(changedCells, id));
      assert.deepEqual(addedFrames(page.app), expected(all.filter((c) => c.path === addedEverywhere || c.path === addedPhone), id));
      assert.ok(optionFrames(page.app).every((f) => f.endsWith(`@${id}`)));
      assert.deepEqual([...page.app.querySelectorAll('header [aria-checked="true"]')].map((o) => o.getAttribute('data-viewport')), [id]);
    }
    // Nothing is kept for the next visit.
    assert.deepEqual([...page.stored.keys()], []);
  });

  test('the size shown, with its pixels on the changes, and the other sizes are named in each section\'s line', () => {
    const page = open(data());
    for (const id of ['desktop', 'phone']) {
      pick(page, id);
      const vp = viewports.find((v) => v.id === id)!;
      const others = viewports.filter((v) => v.id !== id);
      assert.ok(meta(page.app, 'changed').includes(`${vp.width} × ${vp.height}`), meta(page.app, 'changed'));
      for (const o of others) assert.ok(!meta(page.app, 'changed').includes(`${o.width} × ${o.height}`), meta(page.app, 'changed'));
    }
    // The line changes with the size, so the reader always sees what is on the page.
    pick(page, 'desktop');
    const atDesktop = meta(page.app, 'added');
    pick(page, 'phone');
    assert.notEqual(meta(page.app, 'added'), atDesktop);
  });

  test('every visit opens at desktop, whatever was picked on an earlier visit or on the board', () => {
    const first = open(data());
    pick(first, 'phone');
    assert.equal(first.ctx.size, 'phone');
    // The board keeps its own last size for the product; the preview does not follow it.
    const again = open(data(), { [KEY]: 'phone' });
    assert.equal(again.ctx.size, 'desktop');
    assert.deepEqual(changes(again.app), changes(open(data()).app));
    // Blocked storage changes nothing either, and picking still works.
    const blocked = open(data(), {}, true);
    assert.equal(blocked.ctx.size, 'desktop');
    pick(blocked, 'wide');
    assert.equal(blocked.ctx.size, 'wide');
  });

  test('a product without a desktop size opens at its first size', () => {
    assert.equal(previewOpeningSize(viewports)?.id, 'desktop');
    assert.equal(previewOpeningSize(viewports.filter((v) => v.id !== 'desktop'))?.id, 'wide');
    assert.equal(previewOpeningSize([]), null);
  });

  test('a deep link to a frame at another size selects that size and reveals it, before or after', () => {
    const page = open(data());
    const target: Cell = data().preview!.sections[0]!.lines.flatMap((l) => l.cells).find((c) => c.path === changed[0] && c.root === 'base' && c.viewport === 'phone')!;
    page.window.location.hash = frameHash(target, 'board');
    mountRoutes(page.ctx, () => () => undefined);
    assert.equal(page.ctx.size, 'phone');
    assert.ok(changes(page.app).every((c) => c.endsWith('@phone') || c.startsWith('screens/settings/profile')));
    const revealed = page.app.querySelector<HTMLElement>('[data-scrolled="yes"]');
    assert.equal(revealed?.dataset.path, target.path);
    assert.equal(revealed?.dataset.root, 'base');
    assert.equal(revealed?.dataset.viewport, 'phone');
    // Nothing is kept for the next visit.
    assert.deepEqual([...page.stored.keys()], []);
  });

  test('revealing a frame already on the page keeps the size, and a page shown at its own size is found there', () => {
    const page = open(data());
    const profile = data().preview!.sections[0]!.lines.flatMap((l) => l.cells).find((c) => c.path === 'screens/settings/profile--default.html' && c.root === 'head' && c.viewport === 'tablet-portrait')!;
    page.ctx.jump(profile);
    assert.equal(page.ctx.size, 'desktop');
    assert.equal(page.app.querySelector<HTMLElement>('[data-scrolled="yes"]')?.dataset.path, profile.path);
  });

  test('the before and after line still works at the size picked', () => {
    const page = open(data());
    pick(page, 'phone');
    const change = page.app.querySelector('.dv-comparison')!;
    change.querySelectorAll<HTMLButtonElement>('.switcher button')[1]!.click();
    const layers = [...change.querySelectorAll<HTMLElement>('.dv-compare-layer')];
    assert.equal(layers.length, 2);
    assert.deepEqual(layers.map((l) => l.style.width), ['390px', '390px']);
    const range = change.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '30';
    range.dispatchEvent(new page.window.Event('input'));
    assert.equal(layers[1]!.style.clipPath, 'inset(0 70% 0 0)');
    // The overlay and its line survive switching sizes away and back.
    pick(page, 'desktop');
    pick(page, 'phone');
    const again = page.app.querySelector('.dv-comparison')!;
    assert.equal(again.querySelector<HTMLInputElement>('input[type=range]')?.getAttribute('value'), '30');
  });

  test('the Size menu keeps the board\'s keys: the down arrow opens it on the current size and Escape closes it', () => {
    const page = open(data());
    const button = page.app.querySelector<HTMLButtonElement>('header .size-menu__button')!;
    const list = page.app.querySelector<HTMLElement>('header .size-menu__list')!;
    let active: Element | null = null;
    page.window.HTMLElement.prototype.focus = function (this: HTMLElement) {
      active = this;
    };
    button.dispatchEvent(Object.assign(new page.window.Event('keydown', { bubbles: true, cancelable: true }), { key: 'ArrowDown' }));
    assert.equal(list.hidden, false);
    assert.equal((active as Element | null)?.getAttribute('data-viewport'), 'desktop');
    list.dispatchEvent(Object.assign(new page.window.Event('keydown', { bubbles: true, cancelable: true }), { key: 'Escape' }));
    assert.equal(list.hidden, true);
  });
});

describe('previews of a board of own sizes', () => {
  const media = join(FIXTURES, 'media');
  const mediaBase = join(tempDir(), 'base');
  const mediaHead = join(tempDir(), 'head');
  cpSync(media, mediaBase, { recursive: true });
  cpSync(media, mediaHead, { recursive: true });
  const pages = ['screens/linkedin/company-logo--default.html', 'screens/linkedin/launch-post--default.html', 'screens/linkedin/launch-post--wide.html'];
  for (const p of pages) edit(mediaHead, p, (html) => html.replace('</main>', '<p>New</p></main>'));
  const brand = 'design-system/brand/mark.html';
  mkdirSync(dirname(join(mediaHead, brand)), { recursive: true });
  writeFileSync(
    join(mediaHead, brand),
    readFileSync(join(mediaHead, pages[0]!), 'utf8')
      .replaceAll('../../design-system/', '../')
      .replace(/<meta name="design:(viewports|frame|download)"[^>]*>\n?/g, '')
      .replace('</title>', '</title>\n<meta name="design:viewports" content="linkedin-company-logo, linkedin-feed-post-square">'),
  );
  const mediaOut = tempDir();
  const r = runCli(['build', mediaHead, '--out', mediaOut, '--base', mediaBase]);
  const mediaSlug = (JSON.parse(readFileSync(join(media, 'design.json'), 'utf8')) as { slug: string }).slug;

  test('shows each changed and added page at its own size, with no size control', () => {
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const d = viewerData(join(mediaOut, mediaSlug, 'index.html'));
    assert.equal(d.ownSizes, true);
    const { ctx, app } = open(d);
    assert.equal(ctx.ownSizes, true);
    assert.equal(app.querySelector('header .switcher, header .size-menu, header [data-viewport]'), null);
    const cells = d.preview!.sections.filter((s) => s.kind === 'changed').flatMap((s) => s.lines.flatMap((l) => l.cells));
    assert.deepEqual(changes(app), expected(cells, ''));
    assert.equal(changes(app).length, pages.length);
    // A page with several sizes shows once, at its first.
    assert.deepEqual(addedFrames(app), [`${brand}@linkedin-company-logo`]);
  });

  test('revealing a page at another of its sizes shows its own frame', () => {
    const d = viewerData(join(mediaOut, mediaSlug, 'index.html'));
    const page = open(d);
    const other = d.preview!.sections.find((s) => s.kind === 'added')!.lines.flatMap((l) => l.cells).find((c) => c.viewport === 'linkedin-feed-post-square')!;
    page.ctx.jump(other);
    assert.deepEqual(page.ctx.selected, { path: brand, root: 'head', viewport: 'linkedin-company-logo' });
    assert.equal(page.app.querySelector<HTMLElement>('[data-scrolled="yes"]')?.dataset.viewport, 'linkedin-company-logo');
  });
});

describe('one size at a time: the rule', () => {
  const cell = (path: string, viewport: string, offered: string[], root: Cell['root'] = 'head'): Cell => ({ path, root, viewport, col: viewport, label: `${path} · ${viewport}`, title: path, viewports: offered });

  test('a page shows at the size picked when it has it, else at its own first size; on a board of own sizes always its own', () => {
    assert.equal(previewSize(cell('a', 'phone', ['desktop', 'phone']), 'phone', false), 'phone');
    assert.equal(previewSize(cell('a', 'phone', ['tablet', 'phone']), 'desktop', false), 'tablet');
    assert.equal(previewSize(cell('a', 'phone', ['desktop', 'phone']), 'phone', true), 'desktop');
  });

  test('lines at one size keep each page\'s heading on its first line left', () => {
    const lines: Line[] = [
      { heading: 'a', cells: [cell('a', 'desktop', ['desktop', 'phone'], 'base'), cell('a', 'desktop', ['desktop', 'phone'])] },
      { cells: [cell('a', 'phone', ['desktop', 'phone'], 'base'), cell('a', 'phone', ['desktop', 'phone'])] },
      { heading: 'b', cells: [cell('b', 'phone', ['phone'])] },
    ];
    const atPhone = linesAtSize(lines, 'phone', false);
    assert.deepEqual(atPhone.map((l) => [l.heading, l.cells.map((c) => `${c.root}:${c.path}@${c.viewport}`)]), [
      ['a', ['base:a@phone', 'head:a@phone']],
      ['b', ['head:b@phone']],
    ]);
    const atDesktop = linesAtSize(lines, 'desktop', false);
    assert.deepEqual(atDesktop.map((l) => [l.heading, l.cells.map((c) => c.viewport)]), [
      ['a', ['desktop', 'desktop']],
      ['b', ['phone']],
    ]);
  });
});
