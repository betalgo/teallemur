import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { parseHTML } from 'linkedom';
import type { Review, ViewerData } from '../src/model.ts';
import { parseReviews, readReviews } from '../src/reviews.ts';
import { Board } from '../src/viewer/board.ts';
import { Context } from '../src/viewer/context.ts';
import { PASS, cleanup, runCli, tempDir } from './helpers.ts';

after(cleanup);

const slug = (JSON.parse(readFileSync(join(PASS, 'design.json'), 'utf8')) as { slug: string }).slug;
const productName = (JSON.parse(readFileSync(join(PASS, 'design.json'), 'utf8')) as { name: string }).name;

/** Entries as a host would write them: two for the fixture product, one for another. */
const ENTRIES = [
  { product: slug, title: 'Onboarding refresh', number: 12, url: 'https://code.example/pr/12', previewUrl: 'https://preview.example/12/', updatedAt: '2026-10-16T09:12:44Z' },
  { product: 'other-app', title: 'Shift swaps', number: 31, url: 'https://code.example/pr/31', previewUrl: 'https://preview.example/31/', updatedAt: '2026-10-17T08:00:00Z' },
  { product: slug, title: 'Sharing  a <b>notebook</b>', number: 15, url: 'https://code.example/pr/15', previewUrl: null, updatedAt: '2026-10-15T10:00:00Z' },
];

function writeReviews(value: unknown): string {
  const file = join(tempDir(), 'reviews.json');
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

const key = (r: Pick<Review, 'product' | 'number'>): string => `${r.product}#${r.number}`;

describe('reviews file', () => {
  test('keeps valid entries, newest change first, and skips the rest with one warning each', () => {
    const bad = [
      { ...ENTRIES[0], number: 1, url: 'javascript:alert(1)' },
      { ...ENTRIES[0], number: 2, previewUrl: '/relative/' },
      { ...ENTRIES[0], number: 3, title: '   ' },
      { ...ENTRIES[0], number: -4 },
      { ...ENTRIES[0], number: 5, product: 'Not A Slug' },
      { ...ENTRIES[0], number: 6, updatedAt: 'yesterday' },
      'not an object',
      ENTRIES[0],
    ];
    const { reviews, warnings } = parseReviews(JSON.stringify([...ENTRIES, ...bad]));
    assert.deepEqual(reviews?.map(key), ['other-app#31', `${slug}#12`, `${slug}#15`]);
    assert.equal(warnings.length, bad.length);
  });

  test('normalises the title and keeps a missing preview or date as null', () => {
    const { reviews } = parseReviews(JSON.stringify([{ ...ENTRIES[2], updatedAt: undefined }]));
    assert.equal(reviews?.[0]?.title, 'Sharing a <b>notebook</b>');
    assert.equal(reviews?.[0]?.previewUrl, null);
    assert.equal(reviews?.[0]?.updatedAt, null);
  });

  test('entries without a date come after dated ones', () => {
    const { reviews } = parseReviews(JSON.stringify([{ ...ENTRIES[0], updatedAt: null }, ENTRIES[2]]));
    assert.deepEqual(reviews?.map(key), [`${slug}#15`, `${slug}#12`]);
  });

  test('an empty array is an empty list; a blank, missing, malformed or non-array file is no list', () => {
    assert.deepEqual(parseReviews('[]'), { reviews: [], warnings: [] });
    assert.deepEqual(parseReviews('  \n'), { reviews: null, warnings: [] });
    for (const text of ['{not json', '{"reviews": []}']) {
      const r = parseReviews(text);
      assert.equal(r.reviews, null);
      assert.equal(r.warnings.length, 1);
    }
    const missing = readReviews(join(tempDir(), 'absent.json'));
    assert.equal(missing.reviews, null);
    assert.equal(missing.warnings.length, 1);
  });
});

/** Rows of the hub's review list, in page order. */
function rows(html: string): { product: string; number: number; links: Record<string, string> }[] {
  const { document } = parseHTML(html);
  return [...document.querySelectorAll('.dv-hub-reviews .review-row')].map((row) => ({
    product: row.getAttribute('data-product') ?? '',
    number: Number(row.getAttribute('data-number')),
    links: Object.fromEntries([...row.querySelectorAll('a[data-link]')].map((a) => [a.getAttribute('data-link'), a.getAttribute('href')])),
  }));
}

describe('hub --reviews', () => {
  const out = tempDir();
  assert.equal(runCli(['build', PASS, '--out', out]).status, 0);
  const hub = (args: string[]): { status: number | null; stderr: string; html: string } => {
    const r = runCli(['hub', '--out', out, '--title', 'Design hub', ...args]);
    return { status: r.status, stderr: r.stderr, html: readFileSync(join(out, 'index.html'), 'utf8') };
  };

  test('lists every open pull request above the boards, newest change first, with its preview and its page', () => {
    const { status, html } = hub(['--reviews', writeReviews(ENTRIES)]);
    assert.equal(status, 0);
    assert.deepEqual(rows(html).map((r) => `${r.product}#${r.number}`), ['other-app#31', `${slug}#12`, `${slug}#15`]);
    const [, twelve, fifteen] = rows(html);
    assert.deepEqual(twelve?.links, { preview: ENTRIES[0]?.previewUrl, 'pull-request': ENTRIES[0]?.url });
    assert.deepEqual(fifteen?.links, { 'pull-request': ENTRIES[2]?.url }, 'no preview yet: only the pull request');
    assert.ok(html.indexOf('dv-hub-reviews') < html.indexOf('class="card-grid"'), 'the list comes before the cards');
    const { document } = parseHTML(html);
    for (const a of document.querySelectorAll('.review-row a')) {
      assert.equal(a.getAttribute('target'), '_blank');
      assert.match(a.getAttribute('rel') ?? '', /\bnoopener\b/);
    }
  });

  test('names each product as its board does, and escapes what the file says', () => {
    const { html } = hub(['--reviews', writeReviews(ENTRIES)]);
    const { document } = parseHTML(html);
    const products = [...document.querySelectorAll('.review-row__product')].map((el) => el.textContent);
    assert.deepEqual(products, ['other-app', productName, productName]);
    assert.equal(document.querySelectorAll('.review-row b').length, 0, 'markup in a title stays text');
  });

  test('says nothing is waiting when the list is empty', () => {
    const { status, html } = hub(['--reviews', writeReviews([])]);
    assert.equal(status, 0);
    const { document } = parseHTML(html);
    assert.equal(document.querySelector('.dv-hub-reviews')?.getAttribute('data-reviews'), '0');
    assert.ok(document.querySelector('.dv-hub-reviews .review-list__empty'));
    assert.equal(rows(html).length, 0);
  });

  test('leaves the section out, and still writes the hub, when the file is missing, blank or malformed', () => {
    for (const file of [join(tempDir(), 'absent.json'), writeReviews(''), writeReviews('{oops')]) {
      const { status, html } = hub(['--reviews', file]);
      assert.equal(status, 0, file);
      assert.equal(parseHTML(html).document.querySelector('.dv-hub-reviews'), null, file);
      assert.ok(parseHTML(html).document.querySelector('.product-card'), file);
    }
    const { html } = hub([]);
    assert.equal(parseHTML(html).document.querySelector('.dv-hub-reviews'), null);
  });

  test('skipped entries are reported on stderr and never become links', () => {
    const { status, stderr, html } = hub(['--reviews', writeReviews([...ENTRIES, { ...ENTRIES[0], number: 99, url: 'javascript:alert(1)' }])]);
    assert.equal(status, 0);
    assert.match(stderr, /entry 4/);
    assert.doesNotMatch(html, /javascript:/i);
    assert.equal(rows(html).length, ENTRIES.length);
  });

  test('the page still loads nothing from outside the site: outside addresses are only links', () => {
    const { html } = hub(['--reviews', writeReviews(ENTRIES)]);
    const { document } = parseHTML(html);
    for (const el of document.querySelectorAll('[src], link[href]')) {
      assert.doesNotMatch(el.getAttribute('src') ?? el.getAttribute('href') ?? '', /^[a-z]+:/i);
    }
  });
});

function boardData(dir: string): ViewerData {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  return JSON.parse(/<script type="application\/json" id="dv-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '') as ViewerData;
}

describe('build --reviews', () => {
  test('a board carries its own product\'s pull requests, newest change first', () => {
    const out = tempDir();
    assert.equal(runCli(['build', PASS, '--out', out, '--reviews', writeReviews(ENTRIES)]).status, 0);
    assert.deepEqual(boardData(join(out, slug)).reviews?.map(key), [`${slug}#12`, `${slug}#15`]);
  });

  test('a board has no pull requests without the file, with a missing file, or with none for its product', () => {
    for (const args of [[], ['--reviews', join(tempDir(), 'absent.json')], ['--reviews', writeReviews([ENTRIES[1]])], ['--reviews', writeReviews([])]]) {
      const out = tempDir();
      assert.equal(runCli(['build', PASS, '--out', out, ...args]).status, 0, args.join(' '));
      assert.equal(boardData(join(out, slug)).reviews, undefined, args.join(' '));
    }
  });

  test('a preview does not take a reviews file', () => {
    assert.equal(runCli(['build', PASS, '--out', tempDir(), '--base', PASS, '--reviews', writeReviews(ENTRIES)]).status, 2);
  });
});

describe('board strip', () => {
  const out = tempDir();
  assert.equal(runCli(['build', PASS, '--out', out]).status, 0);
  const base = boardData(join(out, slug));

  function mount(reviews: Review[] | undefined): { ctx: Context; board: Board } {
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
    const data: ViewerData = reviews ? { ...base, reviews } : base;
    const ctx = new Context(data);
    const board = new Board(ctx, data.board);
    document.body.append(board.el);
    board.render();
    return { ctx, board };
  }

  const mine = (parseReviews(JSON.stringify(ENTRIES)).reviews ?? []).filter((r) => r.product === slug);

  test('sits above the design system and links each preview, or the pull request before it has one', () => {
    const { board } = mount(mine);
    const first = board.el.firstElementChild;
    assert.ok(first?.classList.contains('review-strip'));
    assert.equal(first?.nextElementSibling?.getAttribute('data-kind'), 'design-system');
    assert.equal(first?.getAttribute('data-reviews'), String(mine.length));
    const links = [...board.el.querySelectorAll('.review-strip__link')].map((a) => [a.getAttribute('data-link'), a.getAttribute('href'), a.getAttribute('target')]);
    assert.deepEqual(links, [
      ['preview', ENTRIES[0]?.previewUrl, '_blank'],
      ['pull-request', ENTRIES[2]?.url, '_blank'],
    ]);
  });

  test('is not there when the product has no open pull requests', () => {
    assert.equal(mount(undefined).board.el.querySelector('.review-strip'), null);
    assert.equal(mount([]).board.el.querySelector('.review-strip'), null);
  });

  test('stays while a search hides every frame, and the empty message still shows', () => {
    const { ctx, board } = mount(mine);
    ctx.setFilters({ query: 'nothing matches this' });
    assert.ok(board.el.querySelector('.review-strip'));
    assert.ok(board.el.querySelector('.dv-empty'));
  });

  test('only http(s) addresses become links', () => {
    const first = mine[0] as Review;
    assert.equal(mount([{ ...first, previewUrl: null, url: 'javascript:alert(1)' }]).board.el.querySelector('.review-strip'), null);
    const fallback = mount([{ ...first, previewUrl: 'javascript:alert(1)' }]).board.el.querySelector('.review-strip__link');
    assert.equal(fallback?.getAttribute('href'), first.url);
  });
});

describe('hub review panel', () => {
  const out = tempDir();
  assert.equal(runCli(['build', PASS, '--out', out]).status, 0);
  const five = Array.from({ length: 5 }, (_, i) => ({ ...ENTRIES[0], number: i + 1, updatedAt: `2026-10-1${i}T09:00:00Z` }));
  const hubHtml = (entries: unknown[]): string => {
    assert.equal(runCli(['hub', '--out', out, '--title', 'Design hub', '--reviews', writeReviews(entries)]).status, 0);
    return readFileSync(join(out, 'index.html'), 'utf8');
  };
  const fiveHtml = hubHtml(five);
  const threeHtml = hubHtml(five.slice(0, 3));

  /** Loads a hub page as a browser would, at phone or desktop width, with this storage, and runs the viewer's wiring. */
  async function open(html: string, phone: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> | 'blocked'): Promise<Document> {
    const { document, window } = parseHTML(html);
    const localStorageValue =
      storage === 'blocked'
        ? {
            getItem: () => {
              throw new Error('blocked');
            },
            setItem: () => {
              throw new Error('blocked');
            },
          }
        : storage;
    Object.assign(globalThis, { document, window, localStorage: localStorageValue, matchMedia: () => ({ matches: phone, addEventListener() {} }) });
    const { mountReviewPanel } = await import('../src/viewer/reviews.ts');
    mountReviewPanel(document as unknown as Document);
    return document as unknown as Document;
  }

  function memory(): Pick<Storage, 'getItem' | 'setItem'> {
    const values = new Map<string, string>();
    return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v) };
  }

  const panel = (d: Document): HTMLElement => d.querySelector('.review-panel') as HTMLElement;
  const toggle = (d: Document): HTMLButtonElement => d.querySelector('.review-panel__toggle') as HTMLButtonElement;
  const visibleRows = (d: Document): number[] => [...d.querySelectorAll<HTMLElement>('.review-row')].filter((r) => !r.hasAttribute('hidden')).map((r) => Number(r.dataset.number));

  test('the toggle is a real button that controls the list, and says whether it is open', async () => {
    const d = await open(fiveHtml, false, memory());
    const t = toggle(d);
    assert.equal(t.tagName, 'BUTTON');
    assert.equal(t.getAttribute('type'), 'button');
    assert.ok(d.getElementById(t.getAttribute('aria-controls') ?? ''), 'aria-controls names the list body');
    assert.equal(t.getAttribute('aria-expanded'), panel(d).dataset.open);
  });

  test('with no choice yet it starts open on desktop and closed on phones', async () => {
    assert.equal(panel(await open(fiveHtml, false, memory())).dataset.open, 'true');
    const phone = await open(fiveHtml, true, memory());
    assert.equal(panel(phone).dataset.open, 'false');
    assert.equal(toggle(phone).getAttribute('aria-expanded'), 'false');
  });

  test('opening or closing it is remembered in this browser, at any size', async () => {
    const storage = memory();
    const phone = await open(fiveHtml, true, storage);
    toggle(phone).click();
    assert.equal(panel(phone).dataset.open, 'true');
    assert.equal(toggle(phone).getAttribute('aria-expanded'), 'true');
    assert.equal(panel(await open(fiveHtml, true, storage)).dataset.open, 'true', 'the next phone visit keeps it open');
    const desktop = await open(fiveHtml, false, storage);
    toggle(desktop).click();
    assert.equal(panel(desktop).dataset.open, 'false');
    assert.equal(panel(await open(fiveHtml, false, storage)).dataset.open, 'false', 'the next desktop visit keeps it closed');
  });

  test('blocked storage still opens and closes, from the default', async () => {
    const d = await open(fiveHtml, true, 'blocked');
    assert.equal(panel(d).dataset.open, 'false');
    toggle(d).click();
    assert.equal(panel(d).dataset.open, 'true');
  });

  test('at most three rows show, newest first, until "Show all" opens the rest in place', async () => {
    const d = await open(fiveHtml, false, memory());
    assert.deepEqual(visibleRows(d), [5, 4, 3]);
    const more = d.querySelector<HTMLButtonElement>('[data-reviews-more]');
    assert.ok(more);
    assert.equal(more.tagName, 'BUTTON');
    assert.equal(more.getAttribute('aria-expanded'), 'false');
    more.click();
    assert.deepEqual(visibleRows(d), [5, 4, 3, 2, 1]);
    assert.equal(more.getAttribute('aria-expanded'), 'true');
    more.click();
    assert.deepEqual(visibleRows(d), [5, 4, 3]);
  });

  test('three or fewer: every row shows and there is no "Show all"', async () => {
    const d = await open(threeHtml, false, memory());
    assert.deepEqual(visibleRows(d), [3, 2, 1]);
    assert.equal(d.querySelector('[data-reviews-more]'), null);
  });

  test('without the viewer script the page still holds every row and the right defaults', () => {
    const { document } = parseHTML(fiveHtml);
    assert.equal(document.querySelector('.review-panel')?.getAttribute('data-open'), 'auto');
    assert.equal(document.querySelectorAll('.review-row').length, 5);
    assert.equal(document.querySelectorAll('.review-row[hidden]').length, 2);
  });
});
