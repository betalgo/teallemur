import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import type { Cell, ViewerData } from '../src/model.ts';
import { comparison } from '../src/viewer/comparison.ts';
import { Context } from '../src/viewer/context.ts';
import { FrameLoader } from '../src/viewer/loader.ts';
import { renderPreview } from './preview-dom.ts';

test('comparison pairs base and head at identical viewport dimensions, puts before left of the line, and preserves state', () => {
  const { document, window } = parseHTML('<html><body></body></html>');
  Object.assign(window, { location: { href: 'http://localhost/example/' } });
  const observed = new Set<Element>();
  Object.assign(globalThis, { document, window, IntersectionObserver: class {
    observe(el: Element) { observed.add(el); }
    unobserve(el: Element) { observed.delete(el); }
  } });
  const data: ViewerData = { kind: 'preview', product: { name: '', slug: 'example' }, commit: null, viewports: [{ id: 'desktop', width: 1440, height: 900 }], flows: [], roots: { head: '', base: '_base/' }, board: [] };
  const after: Cell = { path: 'screens/auth/login--default.html', root: 'head', viewport: 'desktop', col: 'desktop', viewports: ['desktop'], label: '', title: '' };
  const before = { ...after, root: 'base' as const };
  const loader = new FrameLoader(null, '0px');
  const makers: (() => HTMLIFrameElement)[] = [];
  const observe = loader.observe.bind(loader);
  loader.observe = (host, make) => { makers.push(make); observe(host, make); };
  const state = { overlay: false, split: 50 };
  const ctx = new Context(data);
  const el = comparison(ctx, before, after, loader, state);
  document.body.append(el);
  assert.equal(observed.size, 2);
  assert.deepEqual([...el.querySelectorAll('.dv-frame')].map((f) => f.getAttribute('data-root')), ['base', 'head']);
  el.querySelectorAll<HTMLButtonElement>('.switcher button')[1]!.click();
  assert.equal(state.overlay, true);
  assert.equal(observed.size, 2); // Replaced panes were forgotten.
  const frames = makers.slice(-2).map((make) => make());
  const layers = [...el.querySelectorAll<HTMLElement>('.dv-compare-layer')];
  // After underneath, before on top.
  assert.deepEqual(frames.map((f) => f.getAttribute('src')), [after.path, `_base/${after.path}`]);
  assert.deepEqual(frames.map((f) => [f.getAttribute('width'), f.getAttribute('height')]), [['1440', '900'], ['1440', '900']]);
  const range = el.querySelector<HTMLInputElement>('input[type=range]')!;
  for (const value of [0, 27, 100]) {
    range.value = String(value);
    range.dispatchEvent(new window.Event('input'));
    // The before copy shows from the left edge up to the line.
    assert.equal(layers[1]!.style.clipPath, `inset(0 ${100 - value}% 0 0)`);
    assert.equal(state.split, value);
  }
  assert.equal(layers[0]!.style.width, layers[1]!.style.width);
  assert.equal(layers[0]!.style.height, layers[1]!.style.height);
  loader.clear();
  const again = comparison(ctx, before, after, loader, state);
  assert.equal(again.querySelector<HTMLInputElement>('input')?.getAttribute('value'), '100');
  again.querySelector<HTMLButtonElement>('.switcher button')!.click();
  assert.equal(state.overlay, false);
  assert.equal(again.querySelectorAll('.dv-frame').length, 2);
  assert.equal(again.querySelectorAll('.dv-compare-layer').length, 0);
  assert.equal(observed.size, 2);
});

test('returning a base frame to the preview reveals its before copy, including overlay mode', () => {
  const after: Cell = { path: 'screens/auth/login--default.html', root: 'head', viewport: 'desktop', col: 'desktop', viewports: ['desktop'], label: '', title: '' };
  const before = { ...after, root: 'base' as const };
  const data: ViewerData = { kind: 'preview', product: { name: '', slug: 'example' }, commit: null, viewports: [{ id: 'desktop', width: 1440, height: 900 }], flows: [], roots: { head: '', base: '_base/' }, board: [], preview: { label: null, base: null, boardHref: 'board/', shared: null, sections: [{ id: 'changed', kind: 'changed', title: '', align: false, columns: [], lines: [{ cells: [before, after] }] }] } };
  const ctx = new Context(data);
  const app = renderPreview(data, ctx);
  let revealed: HTMLElement | null = null;
  window.HTMLElement.prototype.scrollIntoView = function () { revealed = this; };
  window.HTMLElement.prototype.focus = () => undefined;
  ctx.jump(before);
  assert.equal((revealed as HTMLElement | null)?.dataset.root, 'base');
  app.querySelectorAll<HTMLButtonElement>('.dv-comparison .switcher button')[1]!.click();
  ctx.jump(before);
  assert.ok((revealed as HTMLElement | null)?.classList.contains('dv-comparison'));
  assert.equal((revealed as HTMLElement | null)?.dataset.path, before.path);
});
