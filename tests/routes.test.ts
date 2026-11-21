import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import type { Cell, ViewerData } from '../src/model.ts';
import { Context } from '../src/viewer/context.ts';
import { frameHash, mountRoutes, parseFrameHash, resolveFrame } from '../src/viewer/routes.ts';

const cell: Cell = { path: 'screens/auth/login--error.html', root: 'head', viewport: 'phone', col: 'phone', label: '', title: '', viewports: ['phone'] };
const data: ViewerData = { kind: 'board', product: { name: '', slug: 'example' }, commit: null, viewports: [{ id: 'phone', width: 390, height: 844 }], flows: [], roots: { head: '', base: '_base/' }, board: [{ id: 'auth', kind: 'flow', title: '', align: true, columns: ['phone'], lines: [{ cells: [cell] }] }] };

test('screen links use the public address and resolve only existing frames', () => {
  assert.equal(frameHash(cell), '#/auth/login--error@phone');
  const route = parseFrameHash(frameHash(cell))!;
  assert.equal(resolveFrame(data, route), cell);
  assert.equal(resolveFrame(data, { ...route, viewport: 'missing' }), null);
  assert.equal(resolveFrame(data, { ...route, root: 'base' }), null);
  assert.equal(resolveFrame(data, { ...route, path: 'screens/auth/missing--default.html' }), null);
});

test('all page paths, base copies and board addresses roundtrip', () => {
  for (const path of [cell.path, 'design-system/brand/logo.html', 'explorations/2026-01-01-a/b/screens/auth/login--default.html', 'archive/old login/screens/auth/a--b.html']) {
    for (const root of ['head', 'base'] as const) {
      for (const view of ['focus', 'board'] as const) {
        assert.deepEqual(parseFrameHash(frameHash({ path, viewport: 'phone', root }, view)), { path, viewport: 'phone', root, view });
      }
    }
  }
});

test('malformed, remote and traversal addresses are ignored', () => {
  for (const hash of ['', '#board', '#/auth/login--error', '#/auth/login--error@phone?root=remote', '#/auth/login--error@phone?view=invalid', '#/auth/login--error@phone?redirect=evil', '#/file/../secret@phone', '#/file/%2e%2e/secret@phone', '#/file/%zz@phone', '#/file/a%5cb@phone']) assert.equal(parseFrameHash(hash), null, hash);
});

test('routing handles initial URL, UI actions, close, and browser history with one active focus', () => {
  const { window } = parseHTML('<html></html>');
  const location = { hash: frameHash(cell), href: `http://localhost/example/${frameHash(cell)}` };
  Object.assign(window, { location, history: { pushState(_state: unknown, _title: string, hash: string) { location.hash = hash; location.href = `http://localhost/example/${hash}`; } } });
  Object.assign(globalThis, { window });
  const ctx = new Context(data);
  let opened = 0;
  let closed = 0;
  let jumps = 0;
  ctx.jump = () => jumps++;
  mountRoutes(ctx, (selected) => {
    assert.equal(selected, cell);
    opened++;
    return () => { closed++; };
  });
  assert.equal(opened, 1);
  ctx.navigate(cell, 'board');
  assert.equal(closed, 1);
  assert.equal(jumps, 2);
  ctx.focus(cell);
  assert.equal(opened, 2);
  location.hash = frameHash(cell, 'board');
  window.dispatchEvent(new window.Event('popstate'));
  window.dispatchEvent(new window.Event('hashchange'));
  assert.equal(closed, 2);
  assert.equal(jumps, 4);
  assert.equal(ctx.ref(cell, 'phone'), `example ${cell.path} @ phone\nhttp://localhost/example/${frameHash(cell)}`);
});
