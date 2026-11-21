import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Cell, Section, ViewerData, Viewport } from '../src/model.ts';
import { mainViewport, coverFrame } from '../src/sizes.ts';
import { allFilters, fileUrl, matches, reference } from '../src/viewer/filters.ts';
import { columns, fitScale, minColumn } from '../src/viewer/layout.ts';
import { dayTime, humanize } from '../src/viewer/format.ts';

const viewports: Viewport[] = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'phone', width: 390, height: 844 },
];

function cell(path: string, viewport: string, flow = 'auth'): Cell {
  return { path, root: 'head', viewport, col: viewport, label: `${path} · ${viewport}`, title: path, viewports: ['desktop', 'phone'], flow };
}

function section(id: string, lines: Cell[][], extra: Partial<Section> = {}): Section {
  return { id, kind: 'flow', title: id, align: true, columns: ['desktop', 'phone'], lines: lines.map((cells) => ({ cells })), ...extra };
}

const data: ViewerData = {
  kind: 'board',
  product: { name: 'Example', slug: 'example' },
  commit: null,
  viewports,
  flows: [{ id: 'auth', title: 'Auth' }],
  roots: { head: '', base: '_base/' },
  board: [],
};

describe('board sizing', () => {
  test('desktop frames come three to a row on a laptop wall, phone frames more, and a phone screen gets one column', () => {
    const wall = 1440 - 272 - 88;
    assert.equal(columns(wall, minColumn(1440), 28), 3);
    assert.ok(columns(wall, minColumn(390), 28) > 3);
    assert.equal(columns(390 - 32, minColumn(1440), 28), 1);
  });

  test('the focus view fits a frame in the space it has and never enlarges it', () => {
    assert.equal(fitScale(1440, 900, 1344, 754), 754 / 900);
    assert.equal(fitScale(390, 844, 2000, 2000), 1);
    assert.equal(fitScale(1440, 900, 720, 2000), 0.5);
  });

  test('the main size is the one with the most frames, ties going to design.json order; the archive does not count', () => {
    const both = section('a', [[cell('screens/auth/a--default.html', 'desktop'), cell('screens/auth/a--default.html', 'phone')]]);
    assert.equal(mainViewport([both], viewports)?.id, 'desktop');
    const phoneOnly = section('b', [[cell('screens/auth/b--default.html', 'phone')]]);
    assert.equal(mainViewport([both, phoneOnly], viewports)?.id, 'phone');
    const archive = section('archive', [[cell('archive/x/a.html', 'desktop')], [cell('archive/x/b.html', 'desktop')]], { kind: 'archive' });
    assert.equal(mainViewport([both, phoneOnly, archive], viewports)?.id, 'phone');
  });

  test('the hub cover is the first screen at the main size', () => {
    const brand = section('brand', [[cell('design-system/brand/logo.html', 'desktop')]], { kind: 'brand' });
    const flow = section('flow', [[cell('screens/auth/a--default.html', 'phone')], [cell('screens/auth/b--default.html', 'desktop'), cell('screens/auth/b--default.html', 'phone')], [cell('screens/auth/c--default.html', 'phone')]]);
    assert.deepEqual(coverFrame([brand, flow], viewports), { path: 'screens/auth/a--default.html', viewport: viewports[1] });
  });
});

describe('filters and references', () => {
  test('the board starts at its main size with no search', () => {
    const board = [section('a', [[cell('screens/auth/a--default.html', 'phone')]])];
    const f = allFilters({ ...data, board });
    assert.deepEqual([...f.viewports], ['phone']);
    assert.equal(f.query, '');
  });

  test('filters by size and by text in titles and paths', () => {
    const f = { viewports: new Set(['phone']), query: '' };
    const c = cell('screens/auth/login--error.html', 'phone');
    assert.ok(matches(c, f));
    assert.ok(!matches(c, { ...f, viewports: new Set(['desktop']) }));
    assert.ok(matches(c, { ...f, query: 'LOGIN error' }));
    assert.ok(!matches(c, { ...f, query: 'signup' }));
  });

  test('the copy reference names the slug, path and viewport', () => {
    assert.equal(reference('example', { path: 'screens/auth/login--error.html', root: 'head' }, 'phone'), 'example screens/auth/login--error.html @ phone');
    assert.match(reference('example', { path: 'screens/a--b.html', root: 'base' }, 'phone'), /^example screens\/a--b\.html @ phone /);
  });

  test('frame URLs are relative to the page and encoded per segment', () => {
    assert.equal(fileUrl(data, { path: 'archive/old login/a.html', root: 'head' }), 'archive/old%20login/a.html');
    assert.equal(fileUrl(data, { path: 'screens/a--b.html', root: 'base' }), '_base/screens/a--b.html');
  });
});

describe('interface words', () => {
  test('ids read as words, and commit dates keep their own time zone', () => {
    assert.equal(humanize('email-digest'), 'Email digest');
    assert.equal(dayTime('2026-10-16T14:32:00+02:00'), '16 Oct 2026, 14:32');
    assert.equal(dayTime(null), '');
  });
});
