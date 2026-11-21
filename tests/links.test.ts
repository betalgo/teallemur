import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { parseHTML } from 'linkedom';
import type { Cell, ViewerData } from '../src/model.ts';
import { bindDesignLinks, linkTarget, parseDesignLinks } from '../src/viewer/links.ts';
import { cleanup, copyPass, runCli, tempDir } from './helpers.ts';

after(cleanup);
const head: Cell = { path: 'screens/auth/login--error.html', root: 'head', viewport: 'phone', col: 'phone', viewports: ['phone'], label: '', title: '' };
const data: ViewerData = { kind: 'board', product: { name: '', slug: 'example' }, commit: null, viewports: [{ id: 'phone', width: 390, height: 844 }], flows: [], roots: { head: '', base: '_base/' }, board: [{ id: 'auth', kind: 'flow', title: '', align: true, columns: ['phone'], lines: [{ cells: [head] }] }] };

test('link metadata handles selector punctuation and rejects non-screen targets', () => {
  assert.deepEqual(parseDesignLinks('#next->auth/login--error, [data-name="a,b"] -> auth/login--error, :is(.one,.two) -> auth/login--error'), [
    { selector: '#next', target: 'auth/login--error' },
    { selector: '[data-name="a,b"]', target: 'auth/login--error' },
    { selector: ':is(.one,.two)', target: 'auth/login--error' },
  ]);
  for (const value of ['', '#next', ' -> auth/login--error', '#next -> https://evil.example/path', '#next -> ../auth/login--error', '#next -> auth/login--error@phone', '#next -> auth/login--error?root=base']) assert.deepEqual(parseDesignLinks(value), [], value);
});

test('targets preserve viewport and root when possible, otherwise choose an available head frame', () => {
  assert.equal(linkTarget(data, head, 'auth/login--error'), head);
  assert.equal(linkTarget(data, { ...head, viewport: 'desktop', root: 'base' }, 'auth/login--error'), head);
  assert.equal(linkTarget(data, head, 'auth/missing--default'), null);
  assert.equal(linkTarget(data, head, '../auth/login--error'), null);
  const base = { ...head, root: 'base' as const };
  const preview = { ...data, preview: { label: null, base: null, boardHref: 'board/', shared: null, sections: [{ ...data.board[0]!, lines: [{ cells: [base] }] }] } };
  assert.equal(linkTarget(preview, base, 'auth/login--error'), base);
});

test('delegated click-through handles descendants, ignores invalid/missing entries and detaches without changing the document', () => {
  const { document, window } = parseHTML('<html><head><meta name="design:links" content="[ -> auth/login--error, #missing -> auth/absent--default, #next -> auth/login--error"></head><body><button id="next"><span>Next</span></button><a id="missing" href="#">Missing</a><button id="other">Other</button></body></html>');
  const before = document.toString();
  const calls: Cell[] = [];
  const unbind = bindDesignLinks(document as unknown as Document, data, head, (cell) => calls.push(cell));
  const click = (selector: string, extra = {}): boolean => document.querySelector(selector)!.dispatchEvent(Object.assign(new window.Event('click', { bubbles: true, cancelable: true }), { button: 0, ...extra }));
  assert.equal(click('#next span'), false);
  assert.deepEqual(calls, [head]);
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) assert.equal(click('#next', extra), true);
  assert.equal(click('#missing'), true);
  assert.equal(click('#other'), true);
  assert.equal(calls.length, 1);
  unbind();
  assert.equal(click('#next'), true);
  assert.equal(calls.length, 1);
  assert.equal(document.toString(), before);
});

test('building optional navigation metadata copies the HTML bytes without injecting scripts', () => {
  const repo = copyPass();
  const path = 'screens/auth/login--default.html';
  const html = readFileSync(join(repo, path), 'utf8').replace('</head>', '<meta name="design:links" content="#submit -> auth/login--error"></head>');
  writeFileSync(join(repo, path), html);
  const out = tempDir();
  const design = JSON.parse(readFileSync(join(repo, 'design.json'), 'utf8'));
  const result = runCli(['build', repo, '--out', out]);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(readFileSync(join(out, design.slug, path), 'utf8'), html);
});
