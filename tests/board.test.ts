import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { parseHTML } from 'linkedom';
import type { Cell, ViewerData } from '../src/model.ts';
import { Board } from '../src/viewer/board.ts';
import { Context } from '../src/viewer/context.ts';
import { PASS, cleanup, runCli, tempDir } from './helpers.ts';

after(cleanup);

const out = tempDir();
const slug = (JSON.parse(readFileSync(join(PASS, 'design.json'), 'utf8')) as { slug: string }).slug;
assert.equal(runCli(['build', PASS, '--out', out]).status, 0);
const html = readFileSync(join(out, slug, 'index.html'), 'utf8');
const data = JSON.parse(/<script type="application\/json" id="dv-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '') as ViewerData;

function mount(): { ctx: Context; board: Board; window: Window & typeof globalThis } {
  const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(window, { location: { href: 'http://localhost/example/' } });
  Object.assign(globalThis, {
    document,
    window,
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
    },
  });
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  window.HTMLElement.prototype.focus = () => undefined;
  const ctx = new Context(data);
  const board = new Board(ctx, data.board);
  document.body.append(board.el);
  board.render();
  return { ctx, board, window: window as unknown as Window & typeof globalThis };
}

function frames(board: Board): string[] {
  return [...board.el.querySelectorAll<HTMLElement>('figure.dv-frame')].map((f) => `${f.dataset.path}@${f.dataset.viewport}`);
}

const cells = data.board.flatMap((s) => s.lines.flatMap((l) => l.cells));

describe('board', () => {
  test('shows every page drawn at the current size, one frame each', () => {
    const { ctx, board } = mount();
    const expected = cells.filter((c) => c.viewport === ctx.size && !c.path.startsWith('archive/')).map((c) => `${c.path}@${c.viewport}`);
    const shown = frames(board).filter((f) => !f.startsWith('archive/'));
    assert.deepEqual(shown, expected);
    assert.equal(board.frames, frames(board).length);
  });

  test('the size switcher shows one size at a time', () => {
    const { ctx, board } = mount();
    for (const vp of data.viewports) {
      ctx.setFilters({ viewports: new Set([vp.id]) });
      assert.ok(frames(board).every((f) => f.endsWith(`@${vp.id}`)), vp.id);
    }
  });

  test('search narrows the frames to titles and paths that match', () => {
    const { ctx, board } = mount();
    ctx.setFilters({ query: 'login error' });
    assert.ok(frames(board).length > 0);
    assert.ok(frames(board).every((f) => f.includes('login--error')));
    ctx.setFilters({ query: 'nothing matches this' });
    assert.equal(frames(board).length, 0);
  });

  test('the design system comes first, with the overview card before its pages', () => {
    const { board } = mount();
    const first = board.el.querySelector<HTMLElement>('[data-kind]');
    assert.equal(first?.getAttribute('data-kind'), 'design-system');
    const grid = first?.querySelector('.dv-grid');
    assert.equal(grid?.firstElementChild?.getAttribute('data-kind'), 'overview');
    assert.equal(grid?.querySelector('.overview-card')?.getAttribute('href'), data.board[0]?.overview?.href);
    const kinds = [...board.el.querySelectorAll(':scope > [data-kind]')].map((el) => el.getAttribute('data-kind'));
    assert.deepEqual(kinds, ['design-system', ...data.board.filter((s) => s.kind === 'flow').map(() => 'flow'), 'exploration', 'archive']);
  });

  test('open options are marked as waiting for a pick', () => {
    const { board } = mount();
    assert.ok(board.el.querySelector('[data-kind="exploration"] .section-head .tag--strong'));
  });

  test('open options show side by side in one card per exploration, with each option named', () => {
    const { board } = mount();
    const sets = board.el.querySelectorAll('.option-set');
    assert.equal(sets.length, data.board.filter((s) => s.kind === 'exploration').length);
    const letters = [...sets[0]!.querySelectorAll('.option__letter')].map((el) => el.textContent);
    assert.deepEqual(letters, [...letters].sort());
    assert.ok(letters.length >= 2);
  });

  test('the archive is closed, and revealing an archived frame opens it and rings the frame', () => {
    const { ctx, board } = mount();
    const archive = board.el.querySelector<HTMLDetailsElement>('details[data-kind="archive"]');
    assert.ok(archive);
    assert.equal(archive.hasAttribute('open'), false);
    const archived = cells.find((c) => c.path.startsWith('archive/')) as Cell;
    board.jump(archived);
    assert.equal(board.el.querySelector('details[data-kind="archive"]')?.hasAttribute('open'), true);
    assert.equal(ctx.size, archived.viewport);
    const ringed = [...board.el.querySelectorAll<HTMLElement>('.dv-shot.is-selected')].map((el) => el.dataset.path);
    assert.deepEqual(ringed, [archived.path]);
  });

  test('revealing a frame at another size switches to that size and clears the search', () => {
    const { ctx, board } = mount();
    const other = cells.find((c) => c.viewport !== ctx.size && c.path.startsWith('screens/')) as Cell;
    ctx.setFilters({ query: 'zzz' });
    board.jump(other);
    assert.equal(ctx.size, other.viewport);
    assert.equal(ctx.filters.query, '');
    assert.ok(frames(board).includes(`${other.path}@${other.viewport}`));
  });
});
