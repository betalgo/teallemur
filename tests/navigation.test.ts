import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { parseHTML } from 'linkedom';
import type { ViewerData } from '../src/model.ts';
import { Context } from '../src/viewer/context.ts';
import { screenTree, stepFrame } from '../src/viewer/navigation.ts';
import { sidebar } from '../src/viewer/sidebar.ts';
import { STORAGE_PREFIX } from '../src/product.ts';
import { PASS, cleanup, runCli, tempDir } from './helpers.ts';

after(cleanup);
const out = tempDir();
const design = JSON.parse(readFileSync(join(PASS, 'design.json'), 'utf8'));
assert.equal(runCli(['build', PASS, '--out', out]).status, 0);
const { document, window } = parseHTML(readFileSync(join(out, design.slug, 'index.html'), 'utf8'));
const data = JSON.parse(document.getElementById('dv-data')?.textContent ?? '') as ViewerData;

test('fixture tree groups states and viewport copies in board order', () => {
  const tree = screenTree(data);
  assert.deepEqual(tree.map((f) => f.id), data.flows.map((f) => f.id));
  for (const flow of tree) {
    const cells = data.board.filter((s) => s.kind === 'flow').flatMap((s) => s.lines.flatMap((l) => l.cells)).filter((c) => c.flow === flow.id);
    assert.deepEqual(flow.screens.flatMap((s) => s.states.flatMap((state) => state.cells)), cells);
    for (const screen of flow.screens) {
      assert.equal(new Set(screen.states.map((s) => s.id)).size, screen.states.length);
      for (const state of screen.states) assert.equal(new Set(state.cells.map((c) => c.path)).size, 1);
    }
  }
  assert.deepEqual(tree[0]?.screens.find((s) => s.id === 'login')?.states.map((s) => s.id), ['default', 'error']);
});

test('tree selection chooses an enabled viewport and tolerates blocked storage', () => {
  Object.assign(globalThis, { document, window, localStorage: { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } } });
  const ctx = new Context(data);
  ctx.filters.viewports = new Set(['phone']);
  const selected: string[] = [];
  const nav = sidebar(ctx, (cell) => selected.push(`${cell.path}@${cell.viewport}`));
  nav.querySelector<HTMLElement>('[data-path="screens/auth/login--error.html"]')?.click();
  assert.deepEqual(selected, ['screens/auth/login--error.html@phone']);
  // Expanding and collapsing works without storage.
  nav.querySelector<HTMLButtonElement>('[data-branch="flow:auth"]')!.click();
});

test('tree restores and saves expanded branches per product', () => {
  const saved = new Map<string, string>();
  const key = `${STORAGE_PREFIX}:tree:${data.product.slug}`;
  saved.set(key, JSON.stringify({ 'flow:auth': true, 'screen:auth/login': false }));
  Object.assign(globalThis, { document, window, localStorage: { getItem: (k: string) => saved.get(k), setItem: (k: string, v: string) => saved.set(k, v) } });
  const nav = sidebar(new Context(data), () => undefined);
  const flow = nav.querySelector<HTMLButtonElement>('[data-branch="flow:auth"]')!;
  const screen = nav.querySelector<HTMLButtonElement>('[data-branch="screen:auth/login"]')!;
  assert.equal(flow.getAttribute('aria-expanded'), 'true');
  assert.equal((flow.nextElementSibling as HTMLElement).hidden, false);
  assert.equal(screen.getAttribute('aria-expanded'), 'false');
  assert.equal((screen.nextElementSibling as HTMLElement).hidden, true);
  screen.click();
  assert.equal((screen.nextElementSibling as HTMLElement).hidden, false);
  assert.equal(JSON.parse(saved.get(key)!)['screen:auth/login'], true);
  flow.click();
  assert.equal(JSON.parse(saved.get(key)!)['flow:auth'], false);
});

test('state and screen keys follow fixture board order, retain viewport, and stop at boundaries', () => {
  for (const flow of screenTree(data)) {
    for (const [i, screen] of flow.screens.entries()) {
      for (const [j, state] of screen.states.entries()) {
        for (const cell of state.cells) {
          for (const [key, offset] of [['ArrowLeft', -1], ['ArrowRight', 1]] as const) {
            const expected = screen.states[j + offset]?.cells;
            assert.equal(stepFrame(data, cell, key), expected?.find((c) => c.viewport === cell.viewport) ?? expected?.[0] ?? null);
          }
          for (const [key, offset] of [['ArrowUp', -1], ['ArrowDown', 1]] as const) {
            const next = flow.screens[i + offset];
            const expected = (next?.states.find((s) => s.id === state.id) ?? next?.states[0])?.cells;
            assert.equal(stepFrame(data, cell, key), expected?.find((c) => c.viewport === cell.viewport) ?? expected?.[0] ?? null);
          }
          let current = cell;
          for (let n = 0; n < state.cells.length; n++) current = stepFrame(data, current, 'v')!;
          assert.equal(current, cell);
        }
      }
    }
  }
});

test('stepping falls back to an available viewport and keeps preview base copies separate', () => {
  const login = screenTree(data)[0]!.screens.find((s) => s.id === 'login')!;
  const start = login.states[0]!.cells.find((c) => c.viewport === 'desktop')!;
  const restricted = { ...data, board: data.board.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, cells: l.cells.filter((c) => !c.path.endsWith('login--error.html') || c.viewport === 'phone') })) })) };
  assert.equal(stepFrame(restricted, start, 'ArrowRight')?.viewport, 'phone');
  const baseSections = data.board.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, cells: l.cells.map((c) => ({ ...c, root: 'base' as const })) })) }));
  const preview = { ...data, preview: { label: null, base: null, boardHref: 'board/', shared: null, sections: baseSections } };
  const next = stepFrame(preview, { ...start, root: 'base' }, 'ArrowRight');
  assert.equal(next?.root, 'base');
  assert.ok(next?.path.endsWith('login--error.html'));
});

test('the sidebar follows the board: design system, flows, open options with the number waiting, archive', () => {
  Object.assign(globalThis, { document, window, localStorage: { getItem: () => null, setItem() {} } });
  const nav = sidebar(new Context(data), () => undefined);
  const top = [...nav.querySelector('.tree')!.querySelectorAll(':scope > [data-branch]')].map((el) => el.getAttribute('data-branch'));
  assert.deepEqual(top, ['design', ...data.flows.map((f) => `flow:${f.id}`), 'options', 'archive']);
  const waiting = nav.querySelector('[data-branch="options"] .tree-row__count')?.textContent ?? '';
  assert.equal(parseInt(waiting, 10), data.board.filter((s) => s.kind === 'exploration').length);
  // The design system starts open, with the overview first.
  assert.equal(nav.querySelector('[data-branch="design"]')?.getAttribute('aria-expanded'), 'true');
  assert.equal(nav.querySelector('[data-branch="design"] + .dv-tree-group > a')?.getAttribute('href'), data.board[0]?.overview?.href);
});
